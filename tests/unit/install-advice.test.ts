// FR-010 / NFR-001: install advice is pure and never promises an install prompt exists everywhere (ADR-038).
import { describe, it, expect } from 'vitest';
import type { InstallEnvironment } from '../../src/application/ports';
import { describeInstallOutcome, installAdvice } from '../../src/application/use-cases/installAdvice';
import { INSTALL_HTTPS_TEXT } from '../../src/shared/constants';

const env = (over: Partial<InstallEnvironment> = {}): InstallEnvironment => ({ isStandalone: false, hasBeforeInstallPrompt: false, isIos: false, isSecureContext: true, ...over });

describe('installAdvice: the four outcomes', () => {
  it('standalone → already installed', () => {
    const a = installAdvice(env({ isStandalone: true }));
    expect(a.kind).toBe('already-installed');
    expect(a.label).toBe('Installed');
  });
  it('secure + install event held → install prompt available', () => {
    expect(installAdvice(env({ hasBeforeInstallPrompt: true })).kind).toBe('install-prompt-available');
  });
  it('secure + iOS (no install event) → Share → Add to Home Screen', () => {
    const a = installAdvice(env({ isIos: true }));
    expect(a.kind).toBe('ios-add-to-home-screen');
    expect(a.label).toBe('iPhone / iPad: Share → Add to Home Screen');
    expect(a.detail).toContain('does not show an install prompt');
  });
  it('secure, not iOS, no install event → not available here, reason no-install-prompt', () => {
    const a = installAdvice(env());
    expect(a.kind).toBe('not-available');
    if (a.kind === 'not-available') expect(a.reason).toBe('no-install-prompt');
  });
});

describe('installAdvice: precedence and honesty', () => {
  it('not a secure context → not available, says HTTPS is required and mentions the self-signed dev certificate', () => {
    const a = installAdvice(env({ isSecureContext: false }));
    expect(a.kind).toBe('not-available');
    if (a.kind === 'not-available') expect(a.reason).toBe('insecure-context');
    expect(a.detail).toContain(INSTALL_HTTPS_TEXT);
    expect(INSTALL_HTTPS_TEXT).toContain('HTTPS');
    expect(INSTALL_HTTPS_TEXT).toContain('self-signed');
  });
  it('insecure wins over an install event and over iOS (checked before them)', () => {
    expect(installAdvice(env({ isSecureContext: false, hasBeforeInstallPrompt: true })).kind).toBe('not-available');
    expect(installAdvice(env({ isSecureContext: false, isIos: true })).kind).toBe('not-available');
  });
  it('standalone wins over everything else, even when insecure', () => {
    expect(installAdvice(env({ isStandalone: true, isSecureContext: false, hasBeforeInstallPrompt: true, isIos: true })).kind).toBe('already-installed');
  });
  it('an install event beats the iOS instructions (a browser that offers a prompt is used)', () => {
    expect(installAdvice(env({ isIos: true, hasBeforeInstallPrompt: true })).kind).toBe('install-prompt-available');
  });
  it('exhaustive: all 16 environments give exactly the advice the precedence table says', () => {
    // Hand-written table: [isStandalone, hasBeforeInstallPrompt, isIos, isSecureContext] → kind
    const table: [boolean, boolean, boolean, boolean, string][] = [
      [true, false, false, false, 'already-installed'], [true, false, false, true, 'already-installed'],
      [true, false, true, false, 'already-installed'], [true, false, true, true, 'already-installed'],
      [true, true, false, false, 'already-installed'], [true, true, false, true, 'already-installed'],
      [true, true, true, false, 'already-installed'], [true, true, true, true, 'already-installed'],
      [false, false, false, false, 'not-available'], [false, false, true, false, 'not-available'],
      [false, true, false, false, 'not-available'], [false, true, true, false, 'not-available'],
      [false, false, false, true, 'not-available'], [false, false, true, true, 'ios-add-to-home-screen'],
      [false, true, false, true, 'install-prompt-available'], [false, true, true, true, 'install-prompt-available'],
    ];
    expect(table).toHaveLength(16);
    for (const [s, p, i, c, kind] of table) {
      expect(installAdvice({ isStandalone: s, hasBeforeInstallPrompt: p, isIos: i, isSecureContext: c }).kind).toBe(kind);
    }
  });
  it('never promises installation: no advice text says it "will" work or that every browser supports it', () => {
    for (const s of [true, false]) for (const p of [true, false]) for (const i of [true, false]) for (const c of [true, false]) {
      const a = installAdvice({ isStandalone: s, hasBeforeInstallPrompt: p, isIos: i, isSecureContext: c });
      expect(/\b(all|every) browsers?\b|\bguarantee/i.test(`${a.label} ${a.detail}`)).toBe(false);
    }
  });
  it('is pure: same input, same output; the input object is not modified', () => {
    const e = env({ isIos: true });
    const frozen = Object.freeze({ ...e });
    expect(installAdvice(frozen)).toEqual(installAdvice(e));
  });
});

describe('describeInstallOutcome', () => {
  it('accepted does not claim the install finished', () => {
    const t = describeInstallOutcome({ status: 'accepted' });
    expect(t).toContain('reports the install was accepted');
    expect(t).toContain('cannot confirm it finished');
  });
  it('dismissed, unavailable and failed each have distinct text; failed carries the message', () => {
    const texts = [describeInstallOutcome({ status: 'dismissed' }), describeInstallOutcome({ status: 'unavailable' }), describeInstallOutcome({ status: 'failed', message: 'boom' })];
    expect(new Set(texts).size).toBe(3);
    expect(texts[2]).toBe('The install prompt failed: boom');
  });
});
