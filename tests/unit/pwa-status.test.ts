// FR-010 / NFR-003: PWA lifecycle reducer, update orchestration and wording. Pure; no browser, no service worker.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_PWA_STATE, applyPwaUpdate, reducePwaState, type PwaAction, type PwaState } from '../../src/application/use-cases/pwaStatus';
import type { PwaApplyResult, ServiceWorkerRegistrar } from '../../src/application/ports';
import { describePwaState } from '../../src/features/pwa/describePwaState';
import { OFFLINE_SCOPE_TEXT, UPDATE_RELOAD_WARNING } from '../../src/shared/constants';

const fold = (actions: PwaAction[], from: PwaState = INITIAL_PWA_STATE): PwaState => actions.reduce(reducePwaState, from);
const UPDATE: PwaState = { status: 'update-available', applyError: null };

describe('reducePwaState: first install and repeat visit', () => {
  it('starts not-started and moves registering → registered → offline-ready', () => {
    expect(INITIAL_PWA_STATE).toEqual({ status: 'not-started' });
    expect(fold([{ type: 'registering' }]).status).toBe('registering');
    expect(fold([{ type: 'registering' }, { type: 'registered' }]).status).toBe('registered');
    expect(fold([{ type: 'registering' }, { type: 'registered' }, { type: 'shell-cached' }]).status).toBe('offline-ready');
  });
  it('reaches offline-ready whichever order installed/registered arrive in', () => {
    expect(fold([{ type: 'registering' }, { type: 'shell-cached' }, { type: 'registered' }])).toEqual({ status: 'offline-ready' });
    expect(fold([{ type: 'registering' }, { type: 'registered' }, { type: 'shell-cached' }])).toEqual({ status: 'offline-ready' });
  });
  it('is not offline-ready merely because a worker was registered', () => {
    expect(fold([{ type: 'registering' }, { type: 'registered' }]).status).not.toBe('offline-ready');
  });
  it('is deterministic: the same event list always gives the same state (registrar replay)', () => {
    const events: PwaAction[] = [{ type: 'registering' }, { type: 'registered' }, { type: 'shell-cached' }, { type: 'update-waiting' }];
    expect(fold(events)).toEqual(fold(events));
  });
});

describe('reducePwaState: update flow', () => {
  it('offline-ready + update-waiting → update-available with no error', () => {
    expect(fold([{ type: 'update-waiting' }], { status: 'offline-ready' })).toEqual(UPDATE);
  });
  it('a late shell-cached or registered never downgrades an update flow', () => {
    for (const s of [UPDATE, { status: 'applying-update' } as PwaState, { status: 'update-applied' } as PwaState]) {
      expect(reducePwaState(s, { type: 'shell-cached' })).toEqual(s);
      expect(reducePwaState(s, { type: 'registered' })).toEqual(s);
      expect(reducePwaState(s, { type: 'registering' })).toEqual(s);
    }
  });
  it('update-available is left only by an explicit apply-requested', () => {
    expect(reducePwaState(UPDATE, { type: 'update-waiting' })).toEqual(UPDATE);
    expect(reducePwaState(UPDATE, { type: 'apply-requested' })).toEqual({ status: 'applying-update' });
  });
  it('apply-requested / update-applied / apply-failed are ignored outside their state', () => {
    const ready: PwaState = { status: 'offline-ready' };
    expect(reducePwaState(ready, { type: 'apply-requested' })).toEqual(ready);
    expect(reducePwaState(ready, { type: 'update-applied' })).toEqual(ready);
    expect(reducePwaState(ready, { type: 'apply-failed', message: 'x' })).toEqual(ready);
    expect(reducePwaState(UPDATE, { type: 'update-applied' })).toEqual(UPDATE);
  });
  it('applying-update → update-applied on success, back to update-available with the reason on failure', () => {
    expect(reducePwaState({ status: 'applying-update' }, { type: 'update-applied' })).toEqual({ status: 'update-applied' });
    expect(reducePwaState({ status: 'applying-update' }, { type: 'apply-failed', message: 'timed out' })).toEqual({ status: 'update-available', applyError: 'timed out' });
  });
});

describe('reducePwaState: unsupported and failed are never shown as ready', () => {
  it('unsupported keeps its reason and ignores shell-cached', () => {
    const s = fold([{ type: 'unsupported', reason: 'insecure-context' }, { type: 'shell-cached' }]);
    expect(s).toEqual({ status: 'unsupported', reason: 'insecure-context' });
  });
  it('failed keeps its message, is sticky against shell-cached, and can retry via registering', () => {
    const failed = fold([{ type: 'registering' }, { type: 'failed', message: 'boom' }]);
    expect(failed).toEqual({ status: 'failed', message: 'boom' });
    expect(reducePwaState(failed, { type: 'shell-cached' })).toEqual(failed);
    expect(reducePwaState(failed, { type: 'registering' }).status).toBe('registering');
  });
  it('a failure report after the update was applied does not undo it', () => {
    expect(reducePwaState({ status: 'update-applied' }, { type: 'failed', message: 'late' })).toEqual({ status: 'update-applied' });
  });
});

function fakeRegistrar(result: PwaApplyResult | Error): ServiceWorkerRegistrar & { calls: number } {
  const r = { calls: 0, start() {}, subscribe: () => () => {}, applyUpdate: async () => { r.calls += 1; if (result instanceof Error) throw result; return result; } };
  return r;
}

describe('applyPwaUpdate', () => {
  function run(state: PwaState, registrar: ServiceWorkerRegistrar) {
    const log: string[] = [];
    const dispatch = (a: PwaAction) => log.push(a.type === 'apply-failed' ? `apply-failed:${a.message}` : a.type);
    return { log, done: applyPwaUpdate({ state, registrar, dispatch, reload: () => log.push('RELOAD') }) };
  }
  it('does nothing unless an update is waiting: no dispatch, no registrar call, no reload', async () => {
    for (const s of [INITIAL_PWA_STATE, { status: 'offline-ready' } as PwaState, { status: 'applying-update' } as PwaState]) {
      const reg = fakeRegistrar({ ok: true });
      const { log, done } = run(s, reg);
      await done;
      expect(log).toEqual([]);
      expect(reg.calls).toBe(0);
    }
  });
  it('success: dispatches apply-requested, update-applied, then reloads exactly once, in that order', async () => {
    const { log, done } = run(UPDATE, fakeRegistrar({ ok: true }));
    await done;
    expect(log).toEqual(['apply-requested', 'update-applied', 'RELOAD']);
  });
  it('failure: reports the reason and does NOT reload', async () => {
    const { log, done } = run(UPDATE, fakeRegistrar({ ok: false, message: 'did not take over' }));
    await done;
    expect(log).toEqual(['apply-requested', 'apply-failed:did not take over']);
  });
  it('a throwing registrar becomes apply-failed (never an unhandled rejection) and does not reload', async () => {
    const { log, done } = run(UPDATE, fakeRegistrar(new Error('kaput')));
    await done;
    expect(log[0]).toBe('apply-requested');
    expect(log[1]).toMatch(/^apply-failed:.*kaput/);
    expect(log).not.toContain('RELOAD');
  });
});

describe('describePwaState wording', () => {
  const all: PwaState[] = [
    INITIAL_PWA_STATE,
    { status: 'unsupported', reason: 'development-build' }, { status: 'unsupported', reason: 'insecure-context' }, { status: 'unsupported', reason: 'no-service-worker-api' },
    { status: 'registering' }, { status: 'registered' }, { status: 'offline-ready' }, UPDATE,
    { status: 'applying-update' }, { status: 'update-applied' }, { status: 'failed', message: 'Registration failed: SecurityError' },
  ];
  it('every state has a text label and detail (status is never colour alone)', () => {
    for (const s of all) { const v = describePwaState(s); expect(v.label.length).toBeGreaterThan(5); expect(v.detail.length).toBeGreaterThan(10); }
  });
  it('only update-available offers an action, and only the update action', () => {
    for (const s of all) expect(describePwaState(s).action).toBe(s.status === 'update-available' ? 'apply-update' : null);
  });
  it('only offline-ready says "Offline ready"; a registered-but-uncached worker says it is not ready', () => {
    for (const s of all) expect(/offline ready/i.test(describePwaState(s).label)).toBe(s.status === 'offline-ready');
    expect(describePwaState({ status: 'registered' }).label).toMatch(/not ready/i);
  });
  it('update-available warns about the reload and shows a failed attempt reason', () => {
    expect(describePwaState(UPDATE).detail).toContain(UPDATE_RELOAD_WARNING);
    expect(describePwaState({ status: 'update-available', applyError: 'timed out' }).detail).toContain('timed out');
  });
  it('offline-ready says tiles are not cached and does not claim an offline test happened', () => {
    const d = describePwaState({ status: 'offline-ready' }).detail;
    expect(d).toBe(OFFLINE_SCOPE_TEXT);
    expect(d).toMatch(/tiles are not cached/i);
    expect(d).not.toMatch(/tested|verified|guarantee/i);
  });
  it('failed shows the reason and says the app still works online', () => {
    const d = describePwaState({ status: 'failed', message: 'Registration failed: SecurityError' }).detail;
    expect(d).toContain('SecurityError');
    expect(d).toMatch(/online/i);
  });
  it('the three unsupported reasons have distinct wording; insecure-context mentions HTTPS', () => {
    const labels = (['development-build', 'insecure-context', 'no-service-worker-api'] as const).map((reason) => describePwaState({ status: 'unsupported', reason }).label);
    expect(new Set(labels).size).toBe(3);
    expect(describePwaState({ status: 'unsupported', reason: 'insecure-context' }).detail).toMatch(/HTTPS/);
  });
  it('never uses compliance or location-tracking claims', () => {
    for (const s of all) expect(/\bcompliant\b|certified|background (gps|location)/i.test(`${describePwaState(s).label} ${describePwaState(s).detail}`)).toBe(false);
  });
});

describe('pure PWA modules stay pure', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  it('describePwaState.ts imports no React and no browser APIs', () => {
    const code = readFileSync(join(root, 'src', 'features', 'pwa', 'describePwaState.ts'), 'utf8');
    expect(/from\s+'react'|\bwindow\b|\bdocument\b|\bnavigator\b/.test(code)).toBe(false);
  });
});
