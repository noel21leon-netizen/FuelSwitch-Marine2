// FR-010 / NFR-003: service-worker registrar core against a FAKE worker handle and fake timers.
// This proves our event mapping and update handling. It does NOT prove a real browser registers or caches anything (NOT RUN).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServiceWorkerRegistrar, type RegistrarEnvironment, type WorkerHandle } from '../../src/infrastructure/pwa/serviceWorkerRegistrar';
import { INITIAL_PWA_STATE, reducePwaState } from '../../src/application/use-cases/pwaStatus';
import type { PwaLifecycleEvent } from '../../src/application/ports';

const PROD: RegistrarEnvironment = { hasServiceWorkerApi: true, isSecureContext: true, isProductionBuild: true };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const stateOf = (events: PwaLifecycleEvent[]) => events.reduce(reducePwaState, INITIAL_PWA_STATE);
// A refusal must resolve promptly; if it hangs, fail fast instead of waiting for a test timeout.
const promptly = <T,>(p: Promise<T>): Promise<T | 'HUNG'> => Promise.race([p, flush().then(() => 'HUNG' as const)]);

function makeFake(opts: { hasActiveWorker?: boolean; registerError?: unknown; skipThrows?: boolean } = {}) {
  const fake = {
    installed: [] as Array<(i: { isUpdate: boolean }) => void>,
    waiting: [] as Array<() => void>,
    controlling: [] as Array<() => void>,
    registerCalls: 0,
    skipCalls: 0,
    resolveRegister: () => {},
    rejectRegister: (_e: unknown) => {},
  };
  const handle: WorkerHandle = {
    onInstalled: (cb) => { fake.installed.push(cb); },
    onWaiting: (cb) => { fake.waiting.push(cb); },
    onControlling: (cb) => { fake.controlling.push(cb); },
    register: () => { fake.registerCalls += 1; return new Promise((resolve, reject) => { fake.resolveRegister = () => resolve({ hasActiveWorker: opts.hasActiveWorker ?? false }); fake.rejectRegister = reject; if (opts.registerError !== undefined) reject(opts.registerError); }); },
    skipWaiting: () => { fake.skipCalls += 1; if (opts.skipThrows) throw new Error('postMessage failed'); },
  };
  return { fake, handle };
}
function makeTimers() {
  const timers: Array<{ id: number; cb: () => void; ms: number; cleared: boolean }> = [];
  return { timers, setTimeoutFn: (cb: () => void, ms: number) => { const t = { id: timers.length + 1, cb, ms, cleared: false }; timers.push(t); return t.id; }, clearTimeoutFn: (id: unknown) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true; } };
}
function setup(env: Partial<RegistrarEnvironment> = {}, opts: Parameters<typeof makeFake>[0] = {}, applyTimeoutMs?: number) {
  const { fake, handle } = makeFake(opts);
  const t = makeTimers();
  let created = 0;
  const registrar = createServiceWorkerRegistrar({ environment: () => ({ ...PROD, ...env }), createHandle: () => { created += 1; return handle; }, applyTimeoutMs, setTimeoutFn: t.setTimeoutFn, clearTimeoutFn: t.clearTimeoutFn });
  const events: PwaLifecycleEvent[] = [];
  registrar.subscribe((e) => events.push(e));
  return { registrar, fake, events, timers: t.timers, created: () => created };
}

describe('support detection (nothing registered when unsupported)', () => {
  it('development build → unsupported development-build, no worker created', () => {
    const s = setup({ isProductionBuild: false }); s.registrar.start();
    expect(s.events).toEqual([{ type: 'unsupported', reason: 'development-build' }]);
    expect(s.created()).toBe(0);
  });
  it('insecure context is reported as insecure-context even when the API is also missing', () => {
    const s = setup({ isSecureContext: false, hasServiceWorkerApi: false }); s.registrar.start();
    expect(s.events).toEqual([{ type: 'unsupported', reason: 'insecure-context' }]);
  });
  it('secure context without the API → no-service-worker-api', () => {
    const s = setup({ hasServiceWorkerApi: false }); s.registrar.start();
    expect(s.events).toEqual([{ type: 'unsupported', reason: 'no-service-worker-api' }]);
    expect(stateOf(s.events).status).toBe('unsupported');
  });
  it('the environment is read at start(), not at creation', () => {
    let reads = 0;
    const { handle } = makeFake();
    const r = createServiceWorkerRegistrar({ environment: () => { reads += 1; return PROD; }, createHandle: () => handle });
    expect(reads).toBe(0); r.start(); expect(reads).toBe(1);
  });
});

describe('registration events', () => {
  it('first install: registering, then shell-cached on installed(isUpdate:false), then registered → offline-ready', async () => {
    const s = setup(); s.registrar.start();
    expect(s.events).toEqual([{ type: 'registering' }]);
    s.fake.installed[0]?.({ isUpdate: false });
    s.fake.resolveRegister(); await flush();
    expect(s.events.map((e) => e.type)).toEqual(['registering', 'shell-cached', 'registered']);
    expect(stateOf(s.events)).toEqual({ status: 'offline-ready' });
  });
  it('repeat visit with an active worker: registered then shell-cached → offline-ready', async () => {
    const s = setup({}, { hasActiveWorker: true }); s.registrar.start();
    s.fake.resolveRegister(); await flush();
    expect(s.events.map((e) => e.type)).toEqual(['registering', 'registered', 'shell-cached']);
    expect(stateOf(s.events).status).toBe('offline-ready');
  });
  it('first visit, install not finished yet: registered only — NOT offline-ready', async () => {
    const s = setup(); s.registrar.start();
    s.fake.resolveRegister(); await flush();
    expect(stateOf(s.events).status).toBe('registered');
  });
  it('installed(isUpdate:true) is not reported as a first-install cache', () => {
    const s = setup(); s.registrar.start();
    s.fake.installed[0]?.({ isUpdate: true });
    expect(s.events.map((e) => e.type)).toEqual(['registering']);
  });
  it('a waiting worker is reported as update-waiting → update-available, even if registered/shell-cached arrive after it', async () => {
    const s = setup({}, { hasActiveWorker: true }); s.registrar.start();
    s.fake.waiting[0]?.();
    s.fake.resolveRegister(); await flush();
    expect(stateOf(s.events)).toEqual({ status: 'update-available', applyError: null });
  });
  it('registration rejection → failed with the reason; start() does not throw', async () => {
    const s = setup({}, { registerError: new Error('SecurityError: bad cert') });
    expect(() => s.registrar.start()).not.toThrow(); await flush();
    const failed = s.events.find((e) => e.type === 'failed');
    expect(failed && failed.type === 'failed' && failed.message).toMatch(/registration failed.*SecurityError: bad cert/i);
    expect(stateOf(s.events).status).toBe('failed');
  });
  it('createHandle throwing → failed, nothing registered', () => {
    const r = createServiceWorkerRegistrar({ environment: () => PROD, createHandle: () => { throw new Error('no Workbox'); } });
    const events: PwaLifecycleEvent[] = []; r.subscribe((e) => events.push(e));
    expect(() => r.start()).not.toThrow();
    expect(events.map((e) => e.type)).toEqual(['registering', 'failed']);
  });
  it('start() is idempotent (StrictMode runs effects twice): one handle, one register()', () => {
    const s = setup(); s.registrar.start(); s.registrar.start();
    expect(s.created()).toBe(1); expect(s.fake.registerCalls).toBe(1);
    expect(s.events.filter((e) => e.type === 'registering')).toHaveLength(1);
  });
});

describe('subscribe', () => {
  it('replays earlier events in order to a late subscriber, then delivers new ones', async () => {
    const s = setup({}, { hasActiveWorker: true }); s.registrar.start(); s.fake.resolveRegister(); await flush();
    const late: string[] = []; s.registrar.subscribe((e) => late.push(e.type));
    expect(late).toEqual(['registering', 'registered', 'shell-cached']);
    s.fake.waiting[0]?.(); expect(late.at(-1)).toBe('update-waiting');
  });
  it('unsubscribe stops delivery', () => {
    const s = setup(); const got: string[] = [];
    const off = s.registrar.subscribe((e) => got.push(e.type)); off(); s.registrar.start();
    expect(got).toEqual([]);
  });
  it('a throwing listener does not stop other listeners or registration', async () => {
    const s = setup(); const got: string[] = [];
    s.registrar.subscribe(() => { throw new Error('listener bug'); });
    s.registrar.subscribe((e) => got.push(e.type));
    s.registrar.start(); s.fake.resolveRegister(); await flush();
    expect(got).toEqual(['registering', 'registered']);
  });
});

describe('applyUpdate (only ever on a user request; never reloads)', () => {
  it('without a waiting update: refuses and does not message the worker', async () => {
    const s = setup(); s.registrar.start();
    expect(await promptly(s.registrar.applyUpdate())).toEqual({ ok: false, message: 'No update is waiting.' });
    expect(s.fake.skipCalls).toBe(0);
  });
  it('before start(): refuses', async () => {
    const s = setup();
    expect(await promptly(s.registrar.applyUpdate())).toEqual({ ok: false, message: 'No update is waiting.' });
  });
  it('asks the waiting worker once and resolves ok only when the new worker takes control; clears its timer', async () => {
    const s = setup(); s.registrar.start(); s.fake.waiting[0]?.();
    let result: unknown = 'pending';
    const p = s.registrar.applyUpdate().then((r) => { result = r; });
    await flush();
    expect(s.fake.skipCalls).toBe(1); expect(result).toBe('pending');
    s.fake.controlling[0]?.(); await p;
    expect(result).toEqual({ ok: true });
    expect(s.timers[0]?.cleared).toBe(true);
  });
  it('two taps share one request: same promise, one skipWaiting', async () => {
    const s = setup(); s.registrar.start(); s.fake.waiting[0]?.();
    const a = s.registrar.applyUpdate(); const b = s.registrar.applyUpdate();
    expect(a).toBe(b); expect(s.fake.skipCalls).toBe(1);
    s.fake.controlling[0]?.(); await a;
  });
  it('times out with a visible reason when the worker never takes control, then allows a retry', async () => {
    const s = setup({}, {}, 4000); s.registrar.start(); s.fake.waiting[0]?.();
    const p = s.registrar.applyUpdate();
    expect(s.timers[0]?.ms).toBe(4000);
    s.timers[0]?.cb();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/did not take over within 4 s/);
    const retry = s.registrar.applyUpdate();
    expect(s.fake.skipCalls).toBe(2);
    s.fake.controlling[0]?.(); expect(await retry).toEqual({ ok: true });
  });
  it('a controlling event nobody asked for (e.g. another tab) neither resolves anything nor emits an event', async () => {
    const s = setup(); s.registrar.start(); const before = s.events.length;
    expect(() => s.fake.controlling[0]?.()).not.toThrow();
    expect(s.events.length).toBe(before);
    s.fake.waiting[0]?.();
    const p = s.registrar.applyUpdate(); expect(s.fake.skipCalls).toBe(1);
    s.fake.controlling[0]?.(); await p;
  });
  it('skipWaiting throwing → ok:false with the reason, timer cleared, retry possible', async () => {
    const s = setup({}, { skipThrows: true }); s.registrar.start(); s.fake.waiting[0]?.();
    const r = await s.registrar.applyUpdate();
    expect(!r.ok && r.message).toMatch(/update request failed.*postMessage failed/);
    expect(s.timers[0]?.cleared).toBe(true);
    await s.registrar.applyUpdate(); expect(s.fake.skipCalls).toBe(2);
  });
});

describe('module boundaries (ADR-034)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });
  it('serviceWorkerRegistrar.ts does not import workbox-window; only browserServiceWorker.ts does', () => {
    const importers = walk(join(root, 'src')).filter((f) => /from\s+'workbox-window'/.test(readFileSync(f, 'utf8'))).map((f) => f.split(/[\\/]/).pop());
    expect(importers).toEqual(['browserServiceWorker.ts']);
  });
  it('the service worker never claims clients on its own (an update must wait for the user)', () => {
    const sw = readFileSync(join(root, 'src', 'sw.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(/clientsClaim\s*\(/.test(sw)).toBe(false);
    expect(/skipWaiting\s*\(/.test(sw)).toBe(true);
  });
  it('sw.ts calls skipWaiting only inside the SKIP_WAITING message handler (not at install)', () => {
    const sw = readFileSync(join(root, 'src', 'sw.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(/addEventListener\(\s*'install'/.test(sw)).toBe(false);
    expect(/SKIP_WAITING[\s\S]{0,80}skipWaiting\s*\(/.test(sw)).toBe(true);
  });
});
