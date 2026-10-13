// ADR-048: plain-language GPS wording. The snapshot is built by hand with only the fields the function reads.
import { describe, it, expect } from 'vitest';
import { assessPosition, DEFAULT_DOMAIN_SETTINGS, type VesselPosition } from '../../src/domain';
import type { MonitoringSnapshot, ProviderError } from '../../src/application/use-cases/monitoring';
import { describeGpsState } from '../../src/application/use-cases/gpsStatus';

const NOW = '2026-10-12T06:00:00Z';
const fixAt = (observedAtUtc: string, accuracyMeters: number | null = 8): VesselPosition => ({
  latitudeDeg: 0.5, longitudeDeg: -1, accuracyMeters, observedAtUtc, source: 'browser-gps', sogKnots: null, cogDegreesTrue: null, isSimulated: false,
});
function snap(over: { fix?: VesselPosition | null; error?: ProviderError | null; nowUtc?: string } = {}): MonitoringSnapshot {
  const nowUtc = over.nowUtc ?? NOW;
  const fix = over.fix === undefined ? null : over.fix;
  return { nowUtc, position: assessPosition(fix, nowUtc, DEFAULT_DOMAIN_SETTINGS), lastFix: fix, providerError: over.error ?? null } as unknown as MonitoringSnapshot;
}
const gps = (s: MonitoringSnapshot | null, platform: 'ios' | 'other' = 'other') => describeGpsState({ mode: 'gps', snapshot: s, platform });

describe('describeGpsState', () => {
  it('replay mode says no GPS is in use and that positions are simulated', () => {
    const v = describeGpsState({ mode: 'simulator', snapshot: null, platform: 'other' });
    expect(v.level).toBe('simulated');
    expect(v.detail).toMatch(/SIMULATED/);
  });
  it('before the first snapshot it says GPS is starting', () => {
    expect(gps(null).level).toBe('starting');
  });
  it('a fresh accepted fix is "OK" and shows the measured accuracy and age', () => {
    const v = gps(snap({ fix: fixAt('2026-10-12T05:59:50Z') }));
    expect(v.level).toBe('ok');
    expect(v.detail).toBe('±8 m, 10 s old');
  });
  it('unknown accuracy is said to be not reported, not shown as a number', () => {
    const v = gps(snap({ fix: fixAt('2026-10-12T05:59:55Z', null) }));
    expect(v.detail).toBe('accuracy not reported, 5 s old');
  });
  it('poor accuracy is "weak signal", gives the measured accuracy and says the fix is not used', () => {
    const v = gps(snap({ fix: fixAt('2026-10-12T05:59:55Z', 400) }));
    expect(v.level).toBe('weak');
    expect(v.headline).toBe('Weak GPS signal');
    expect(v.detail).toMatch(/±400 m/);
    expect(v.detail).toMatch(/not used/);
  });
  it('an old fix is "signal lost" with its real age and says ETA and alerts are paused', () => {
    const v = gps(snap({ fix: fixAt('2026-10-12T05:59:00Z') }));
    expect(v.level).toBe('lost');
    expect(v.detail).toMatch(/60 s old/);
    expect(v.detail).toMatch(/paused/);
    expect(v.offerRetryButton).toBe(true);
  });
  it('while a restart is scheduled it counts down, then says it is searching again', () => {
    const error: ProviderError = { kind: 'position-unavailable', message: 'No signal.', atUtc: '2026-10-12T05:59:58Z', retry: { attempt: 2, inSeconds: 4 } };
    const waiting = gps(snap({ fix: fixAt('2026-10-12T05:59:00Z'), error }));
    expect(waiting.detail).toMatch(/Trying again in 2 s \(attempt 2\)/);
    const later = gps(snap({ fix: fixAt('2026-10-12T05:59:00Z'), error, nowUtc: '2026-10-12T06:00:10Z' }));
    expect(later.detail).toMatch(/Searching again \(attempt 2\)/);
  });
  it('no fix yet after an error says searching, with the reason and the retry plan', () => {
    const error: ProviderError = { kind: 'timeout', message: 'Timed out waiting for a GPS fix.', atUtc: NOW, retry: { attempt: 1, inSeconds: 2 } };
    const v = gps(snap({ error }));
    expect(v.level).toBe('searching');
    expect(v.detail).toMatch(/Timed out/);
    expect(v.detail).toMatch(/Trying again in 2 s/);
  });
  it('no fix and no error says no position has been received yet (no numbers)', () => {
    const v = gps(snap());
    expect(v.level).toBe('searching');
    expect(v.detail).toBe('No position has been received yet.');
  });
  it('permission denied on iPhone points to Settings → Location Services and offers a retry', () => {
    const error: ProviderError = { kind: 'permission-denied', message: 'Location permission was denied.', atUtc: NOW };
    const v = gps(snap({ error }), 'ios');
    expect(v.level).toBe('blocked');
    expect(v.action).toMatch(/Location Services/);
    expect(v.offerRetryButton).toBe(true);
  });
  it('permission denied elsewhere points to the browser site settings instead', () => {
    const error: ProviderError = { kind: 'permission-denied', message: 'Location permission was denied.', atUtc: NOW };
    const v = gps(snap({ error }), 'other');
    expect(v.action).toMatch(/Permissions/);
    expect(v.action).not.toMatch(/Location Services/);
  });
  // ADR-049: iPhone Home Screen app with location blocked.
  it('permission denied in an iPhone Home Screen app says to open the link in the browser, with no Settings steps', () => {
    const error: ProviderError = { kind: 'permission-denied', message: 'Location permission was denied. Allow location access for this site in the browser settings, then start again.', atUtc: NOW };
    const v = describeGpsState({ mode: 'gps', snapshot: snap({ error }), platform: 'ios', standalone: true });
    expect(v.level).toBe('blocked');
    expect(v.action).toBe('Home Screen apps on iPhone may not allow GPS. Open the link in your browser instead.');
    expect(v.detail).toBe('Location permission was denied.');
    expect(`${v.headline} ${v.detail} ${v.action}`).not.toMatch(/browser settings|Settings|Location Services|Safari Websites/);
    expect(v.offerRetryButton).toBe(false);
  });
  it('the Home Screen wording is used only on iPhone + Home Screen + permission denied', () => {
    const error: ProviderError = { kind: 'permission-denied', message: 'Location permission was denied.', atUtc: NOW };
    const iosTab = describeGpsState({ mode: 'gps', snapshot: snap({ error }), platform: 'ios', standalone: false });
    const iosOmitted = describeGpsState({ mode: 'gps', snapshot: snap({ error }), platform: 'ios' });
    const androidApp = describeGpsState({ mode: 'gps', snapshot: snap({ error }), platform: 'other', standalone: true });
    expect(iosTab.action).toMatch(/Location Services/); expect(iosTab.offerRetryButton).toBe(true);
    expect(iosOmitted.action).toMatch(/Location Services/);
    expect(androidApp.action).toMatch(/Permissions/); expect(androidApp.action).not.toMatch(/Home Screen/);
    const lost = describeGpsState({ mode: 'gps', snapshot: snap({ fix: fixAt('2026-10-12T05:59:00Z') }), platform: 'ios', standalone: true });
    expect(lost.level).toBe('lost'); expect(lost.action).not.toMatch(/Home Screen/);
  });
  it('an insecure page or an unsupported browser has no retry button (a retry cannot fix it)', () => {
    const insecure = gps(snap({ error: { kind: 'insecure-context', message: 'x', atUtc: NOW } }));
    const unsupported = gps(snap({ error: { kind: 'unsupported', message: 'x', atUtc: NOW } }));
    expect(insecure.level).toBe('blocked'); expect(insecure.offerRetryButton).toBe(false);
    expect(unsupported.level).toBe('blocked'); expect(unsupported.offerRetryButton).toBe(false);
  });
  it('a fix time in the future is "unusable" and suggests checking the phone clock', () => {
    const v = gps(snap({ fix: fixAt('2026-10-12T06:10:00Z') }));
    expect(v.level).toBe('unavailable');
    expect(v.action).toMatch(/date and time/);
  });
});
