// GPS signal wording (FR-001, FR-003, ADR-048). Pure: turns the monitoring snapshot into one plain headline, a reason and a next step,
// the way a maps app says "searching for GPS" or "weak signal". It only describes what the snapshot contains: it never shows an age or
// accuracy that was not measured, and it never says the position is fine unless the domain assessment accepted the fix.
import { parseIsoUtc } from '../../domain';
import type { MonitoringSnapshot } from './monitoring';

export type GpsLevel = 'simulated' | 'starting' | 'searching' | 'ok' | 'weak' | 'lost' | 'blocked' | 'unavailable';

export interface GpsStateView {
  readonly level: GpsLevel;
  /** One short line, e.g. "GPS signal lost". */
  readonly headline: string;
  /** Measured facts and the reason, or null. */
  readonly detail: string | null;
  /** What the person can do next, or null. */
  readonly action: string | null;
  /** True when a "Try GPS again" button makes sense. */
  readonly offerRetryButton: boolean;
}

export interface GpsStateInput {
  readonly mode: 'simulator' | 'gps';
  readonly snapshot: MonitoringSnapshot | null;
  readonly platform: 'ios' | 'other';
  /** True when the app was opened from the Home Screen icon (installed app) rather than a browser tab. Omitted = false. ADR-049. */
  readonly standalone?: boolean;
}

/** iPhone Home Screen apps may not be allowed to use GPS (ADR-049). Said instead of the Settings steps, which only apply to the browser. */
const HOME_SCREEN_IOS_TEXT = 'Home Screen apps on iPhone may not allow GPS. Open the link in your browser instead.';

const OPEN_SKY_TIP = 'Move to open sky or near a window. GPS is weak indoors and inside steel structures.';

function permissionAction(platform: 'ios' | 'other'): string {
  return platform === 'ios'
    ? 'Open Settings → Privacy & Security → Location Services, make sure it is on, then find Safari Websites (or this app\'s name) and choose While Using the App. Come back here and tap Try GPS again.'
    : 'Allow location for this site: tap the lock or settings icon next to the address, open Permissions, set Location to Allow. Then tap Try GPS again.';
}

/** Seconds until the scheduled restart, rounded up, or null when no restart is scheduled or the wait is over. */
function secondsUntilRetry(snapshot: MonitoringSnapshot): number | null {
  const err = snapshot.providerError;
  if (!err || !err.retry) return null;
  const at = parseIsoUtc(err.atUtc);
  const now = parseIsoUtc(snapshot.nowUtc);
  if (at === null || now === null) return null;
  const left = err.retry.inSeconds - (now - at) / 1000;
  return left > 0 ? Math.ceil(left) : null;
}

export function describeGpsState(input: GpsStateInput): GpsStateView {
  if (input.mode === 'simulator') {
    return { level: 'simulated', headline: 'Route replay — no GPS in use', detail: 'Positions are SIMULATED.', action: null, offerRetryButton: false };
  }
  const s = input.snapshot;
  if (s === null) {
    return { level: 'starting', headline: 'Starting GPS…', detail: 'Waiting for the first position from this device.', action: null, offerRetryButton: false };
  }

  const err = s.providerError;
  if (err) {
    switch (err.kind) {
      case 'permission-denied':
        if (input.platform === 'ios' && input.standalone === true) {
          // No Settings steps, no "browser settings" text (err.message contains it, so it is not shown) and no retry button: the person is told to open the link in the browser (ADR-049).
          return { level: 'blocked', headline: 'Location is turned off for this app', detail: 'Location permission was denied.', action: HOME_SCREEN_IOS_TEXT, offerRetryButton: false };
        }
        return { level: 'blocked', headline: 'Location is turned off for this app', detail: err.message, action: permissionAction(input.platform), offerRetryButton: true };
      case 'unsupported':
        return { level: 'blocked', headline: 'This browser cannot provide GPS position', detail: err.message, action: 'Open the app in Safari (iPhone) or Chrome (Android).', offerRetryButton: false };
      case 'insecure-context':
        return { level: 'blocked', headline: 'GPS needs a secure page', detail: err.message, action: 'Open the app from its https:// address.', offerRetryButton: false };
      default:
        break; // position-unavailable / timeout / invalid-fix are handled below together with the fix state
    }
  }

  const a = s.position;
  const retryIn = secondsUntilRetry(s);
  const retryText = err?.retry
    ? (retryIn !== null ? `Trying again in ${retryIn} s (attempt ${err.retry.attempt}).` : `Searching again (attempt ${err.retry.attempt}).`)
    : null;

  if (a.ok) {
    const acc = a.position.accuracyMeters;
    const facts = `${acc !== null ? `±${Math.round(acc)} m, ` : 'accuracy not reported, '}${Math.round(a.ageSeconds)} s old`;
    return { level: 'ok', headline: 'GPS signal OK', detail: facts, action: null, offerRetryButton: false };
  }

  switch (a.reason) {
    case 'stale-fix': {
      const age = a.ageSeconds !== null ? `The last position is ${Math.round(a.ageSeconds)} s old. ` : '';
      return {
        level: 'lost', headline: 'GPS signal lost',
        detail: `${age}ETA and alerts are paused until a new position arrives.${retryText ? ` ${retryText}` : ''}`,
        action: OPEN_SKY_TIP, offerRetryButton: true,
      };
    }
    case 'poor-accuracy': {
      const acc = s.lastFix?.accuracyMeters;
      return {
        level: 'weak', headline: 'Weak GPS signal',
        detail: `${acc !== null && acc !== undefined ? `Accuracy is only ±${Math.round(acc)} m. ` : ''}This position is not used until the signal improves.`,
        action: OPEN_SKY_TIP, offerRetryButton: false,
      };
    }
    case 'no-position':
      return {
        level: 'searching', headline: 'Searching for GPS signal…',
        detail: `${err ? `${err.message} ` : ''}${retryText ?? ''}`.trim() || 'No position has been received yet.',
        action: OPEN_SKY_TIP, offerRetryButton: err !== null,
      };
    default:
      return {
        level: 'unavailable', headline: 'GPS position unusable', detail: a.explanation,
        action: a.reason === 'invalid-timestamp' ? 'Check that the phone date and time are set automatically.' : null,
        offerRetryButton: true,
      };
  }
}
