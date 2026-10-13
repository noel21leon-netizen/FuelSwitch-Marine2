// 5C-2: install-prompt adapter core with a fake event target. Real `beforeinstallprompt` behaviour needs a Chromium browser: NOT RUN.
import { describe, it, expect } from 'vitest';
import { createInstallPrompt, type DeferredInstallEvent, type InstallPromptDeps } from '../../src/infrastructure/pwa/installPrompt';
import { installAdvice } from '../../src/application/use-cases/installAdvice';

class FakeTarget {
  private handlers = new Map<string, ((e: unknown) => void)[]>();
  addEventListener(type: string, l: (e: unknown) => void): void { this.handlers.set(type, [...(this.handlers.get(type) ?? []), l]); }
  removeEventListener(type: string, l: (e: unknown) => void): void { this.handlers.set(type, (this.handlers.get(type) ?? []).filter((x) => x !== l)); }
  fire(type: string, e: unknown = {}): void { for (const l of this.handlers.get(type) ?? []) l(e); }
  count(type: string): number { return (this.handlers.get(type) ?? []).length; }
}

interface FakeEvent extends DeferredInstallEvent { prevented: number; promptCalls: number }
function fakeEvent(outcome: 'accepted' | 'dismissed' | 'throw' = 'accepted'): FakeEvent {
  let resolveChoice!: (v: { outcome: 'accepted' | 'dismissed' }) => void;
  const choice = new Promise<{ outcome: 'accepted' | 'dismissed' }>((r) => { resolveChoice = r; });
  const e = {
    prevented: 0, promptCalls: 0,
    preventDefault() { e.prevented++; },
    async prompt() { e.promptCalls++; if (outcome === 'throw') throw new Error('prompt blocked'); resolveChoice({ outcome }); },
    userChoice: choice,
  };
  return e;
}

function setup(over: Partial<InstallPromptDeps> = {}) {
  const target = new FakeTarget();
  const ctl = createInstallPrompt({ eventTarget: target, isStandalone: () => false, isIos: () => false, isSecureContext: () => true, ...over });
  return { target, ctl };
}

describe('install-prompt adapter: capture and defer', () => {
  it('holds nothing until the browser fires the event; the environment reflects the probes', () => {
    const { ctl } = setup({ isIos: () => true, isSecureContext: () => false });
    ctl.start();
    expect(ctl.getEnvironment()).toEqual({ isStandalone: false, hasBeforeInstallPrompt: false, isIos: true, isSecureContext: false });
  });
  it('start() is idempotent: listeners are attached once', () => {
    const { target, ctl } = setup();
    ctl.start(); ctl.start();
    expect(target.count('beforeinstallprompt')).toBe(1);
    expect(target.count('appinstalled')).toBe(1);
  });
  it('captures the event, suppresses the browser mini-infobar, does not prompt by itself, and notifies', () => {
    const { target, ctl } = setup();
    let notified = 0;
    ctl.subscribe(() => { notified++; });
    ctl.start();
    const ev = fakeEvent();
    target.fire('beforeinstallprompt', ev);
    expect(ev.prevented).toBe(1);
    expect(ev.promptCalls).toBe(0);
    expect(ctl.getEnvironment().hasBeforeInstallPrompt).toBe(true);
    expect(notified).toBe(1);
  });
  it('ignores a malformed event instead of pretending a prompt exists', () => {
    const { target, ctl } = setup();
    ctl.start();
    target.fire('beforeinstallprompt', { not: 'an install event' });
    target.fire('beforeinstallprompt', null);
    expect(ctl.getEnvironment().hasBeforeInstallPrompt).toBe(false);
  });
  it('the advice changes from "not available" to "prompt available" once the event is captured', () => {
    const { target, ctl } = setup();
    ctl.start();
    expect(installAdvice(ctl.getEnvironment()).kind).toBe('not-available');
    target.fire('beforeinstallprompt', fakeEvent());
    expect(installAdvice(ctl.getEnvironment()).kind).toBe('install-prompt-available');
  });
});

describe('install-prompt adapter: promptInstall', () => {
  it('without a held event → unavailable (and nothing throws)', async () => {
    const { ctl } = setup();
    ctl.start();
    expect(await ctl.promptInstall()).toEqual({ status: 'unavailable' });
  });
  it('accepted: prompts once, reports accepted, and consumes the event (single use)', async () => {
    const { target, ctl } = setup();
    ctl.start();
    const ev = fakeEvent('accepted');
    target.fire('beforeinstallprompt', ev);
    expect(await ctl.promptInstall()).toEqual({ status: 'accepted' });
    expect(ev.promptCalls).toBe(1);
    expect(ctl.getEnvironment().hasBeforeInstallPrompt).toBe(false);
    expect(await ctl.promptInstall()).toEqual({ status: 'unavailable' });
    expect(ev.promptCalls).toBe(1);
  });
  it('dismissed is reported as dismissed and the event is still consumed', async () => {
    const { target, ctl } = setup();
    ctl.start();
    target.fire('beforeinstallprompt', fakeEvent('dismissed'));
    expect(await ctl.promptInstall()).toEqual({ status: 'dismissed' });
    expect(ctl.getEnvironment().hasBeforeInstallPrompt).toBe(false);
  });
  it('a prompt that throws becomes a failed outcome with the message, never an exception', async () => {
    const { target, ctl } = setup();
    ctl.start();
    target.fire('beforeinstallprompt', fakeEvent('throw'));
    expect(await ctl.promptInstall()).toEqual({ status: 'failed', message: 'prompt blocked' });
  });
  it('a double tap opens one prompt and both callers get the same answer', async () => {
    const { target, ctl } = setup();
    ctl.start();
    const ev = fakeEvent('accepted');
    target.fire('beforeinstallprompt', ev);
    const [a, b] = await Promise.all([ctl.promptInstall(), ctl.promptInstall()]);
    expect(ev.promptCalls).toBe(1);
    expect(a).toEqual({ status: 'accepted' });
    expect(b).toEqual({ status: 'accepted' });
  });
  it('subscribers are told as soon as the held event is consumed, and unsubscribe stops notifications', async () => {
    const { target, ctl } = setup();
    ctl.start();
    target.fire('beforeinstallprompt', fakeEvent());
    let n = 0;
    const off = ctl.subscribe(() => { n++; });
    await ctl.promptInstall();
    const afterPrompt = n;
    expect(afterPrompt).toBeGreaterThanOrEqual(1);
    off();
    target.fire('beforeinstallprompt', fakeEvent());
    expect(n).toBe(afterPrompt);
  });
});

describe('install-prompt adapter: appinstalled and standalone', () => {
  it('appinstalled clears the held event and reports installed for the session', () => {
    const { target, ctl } = setup();
    ctl.start();
    target.fire('beforeinstallprompt', fakeEvent());
    target.fire('appinstalled');
    const e = ctl.getEnvironment();
    expect(e.hasBeforeInstallPrompt).toBe(false);
    expect(e.isStandalone).toBe(true);
    expect(installAdvice(e).kind).toBe('already-installed');
  });
  it('standalone comes from the injected probe and is re-read on every call (not cached)', () => {
    let standalone = false;
    const { ctl } = setup({ isStandalone: () => standalone });
    ctl.start();
    expect(ctl.getEnvironment().isStandalone).toBe(false);
    standalone = true;
    expect(ctl.getEnvironment().isStandalone).toBe(true);
  });
});
