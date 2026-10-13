// Changeover log (pure). FR-009. Records what a HUMAN confirms; never infers an operational event from GPS.
// Every timestamp is ISO UTC. Domain functions never read the clock: callers inject `nowUtc` and the entry id.
import type { LonLat } from '../geospatial/geo';
import { isValidLonLat } from '../geospatial/geo';
import type { DurationMethod } from '../changeover/planner';
import type { VerificationStatus } from '../regulations/dataset';
import { MS_PER_MINUTE, parseIsoUtc } from '../units';

export const LOG_SCHEMA_VERSION = 1;
/** A human-entered event time may be at most this far ahead of `nowUtc` (clock skew tolerance), never further. */
export const MAX_FUTURE_SKEW_MINUTES = 2;

export type LogPositionSource = 'simulator' | 'browser-gps' | 'unavailable';

/** What the plan looked like when the entry was created — a snapshot, never recomputed afterwards. */
export interface PlanSnapshot {
  readonly plannedStartAtUtc: string | null;
  readonly predictedCrossingAtUtc: string | null;
  readonly plannedStartPointLonLatDeg: LonLat | null;
  readonly durationMinutes: number | null;
  readonly durationMethod: DurationMethod | null;
  readonly durationLabel: string | null;
  readonly marginMinutes: number | null;
}

export interface DatasetSnapshot {
  readonly name: string;
  readonly version: string;
  readonly verificationStatus: VerificationStatus;
}

export interface HumanEvent {
  /** Time the person states the event happened (ISO UTC). */
  readonly eventAtUtc: string;
  /** Time the person confirmed it in the app (ISO UTC). */
  readonly confirmedAtUtc: string;
  /** Position at confirmation if a valid fix was available; null otherwise. Never fabricated. */
  readonly positionLonLatDeg: LonLat | null;
}

export interface AlertAcknowledgment {
  readonly alertId: string;
  readonly acknowledgedAtUtc: string;
}

export type OverridableField = 'actualStart' | 'actualCompletion' | 'duration' | 'margin';

export interface OverrideRecord {
  readonly field: OverridableField;
  readonly previousValue: string | number | null;
  readonly newValue: string | number | null;
  readonly reason: string;
  readonly recordedAtUtc: string;
}

export interface ChangeoverLogEntry {
  readonly schemaVersion: typeof LOG_SCHEMA_VERSION;
  readonly id: string;
  readonly createdAtUtc: string;
  readonly positionSource: LogPositionSource;
  /** True when the plan used simulated positions. Such entries can never be presented as real events. */
  readonly isSimulated: boolean;
  readonly dataset: DatasetSnapshot | null;
  readonly plan: PlanSnapshot;
  readonly actualStart: HumanEvent | null;
  readonly actualCompletion: HumanEvent | null;
  readonly acknowledgments: readonly AlertAcknowledgment[];
  readonly overrides: readonly OverrideRecord[];
  readonly notes: string;
}

export type LogResult =
  | { readonly ok: true; readonly entry: ChangeoverLogEntry }
  | { readonly ok: false; readonly reason: LogErrorReason; readonly explanation: string };

export type LogErrorReason =
  | 'invalid-id' | 'invalid-timestamp' | 'future-timestamp' | 'invalid-position' | 'already-confirmed'
  | 'start-missing' | 'completion-before-start' | 'reason-required' | 'nothing-to-override' | 'invalid-value';

const fail = (reason: LogErrorReason, explanation: string): LogResult => ({ ok: false, reason, explanation });

export interface CreateLogEntryInput {
  readonly id: string;
  readonly positionSource: LogPositionSource;
  readonly dataset: DatasetSnapshot | null;
  readonly plan: PlanSnapshot;
  readonly notes?: string;
}

export function createLogEntry(input: CreateLogEntryInput, nowUtc: string): LogResult {
  if (typeof input.id !== 'string' || input.id.trim() === '') return fail('invalid-id', 'A log entry needs a non-empty id.');
  if (parseIsoUtc(nowUtc) === null) return fail('invalid-timestamp', 'Current time is not valid ISO UTC.');
  for (const [name, v] of [['plannedStartAtUtc', input.plan.plannedStartAtUtc], ['predictedCrossingAtUtc', input.plan.predictedCrossingAtUtc]] as const) {
    if (v !== null && parseIsoUtc(v) === null) return fail('invalid-timestamp', `${name} is not valid ISO UTC.`);
  }
  if (input.plan.plannedStartPointLonLatDeg !== null && !isValidLonLat(input.plan.plannedStartPointLonLatDeg)) {
    return fail('invalid-position', 'Planned start point is not a valid longitude/latitude.');
  }
  for (const [name, v] of [['durationMinutes', input.plan.durationMinutes], ['marginMinutes', input.plan.marginMinutes]] as const) {
    if (v !== null && (!Number.isFinite(v) || v < 0)) return fail('invalid-value', `${name} must be a finite number ≥ 0 or null.`);
  }
  return {
    ok: true,
    entry: {
      schemaVersion: LOG_SCHEMA_VERSION,
      id: input.id,
      createdAtUtc: nowUtc,
      positionSource: input.positionSource,
      isSimulated: input.positionSource === 'simulator',
      dataset: input.dataset,
      plan: input.plan,
      actualStart: null,
      actualCompletion: null,
      acknowledgments: [],
      overrides: [],
      notes: input.notes ?? '',
    },
  };
}

interface EventInput { readonly eventAtUtc: string; readonly positionLonLatDeg: LonLat | null }

function buildEvent(input: EventInput, nowUtc: string): { ok: true; event: HumanEvent } | { ok: false; res: LogResult } {
  const eventMs = parseIsoUtc(input.eventAtUtc);
  const nowMs = parseIsoUtc(nowUtc);
  if (eventMs === null) return { ok: false, res: fail('invalid-timestamp', 'The event time is not a valid ISO UTC timestamp.') };
  if (nowMs === null) return { ok: false, res: fail('invalid-timestamp', 'Current time is not valid ISO UTC.') };
  if (eventMs > nowMs + MAX_FUTURE_SKEW_MINUTES * MS_PER_MINUTE) {
    return { ok: false, res: fail('future-timestamp', 'An event cannot be confirmed with a time in the future.') };
  }
  if (input.positionLonLatDeg !== null && !isValidLonLat(input.positionLonLatDeg)) {
    return { ok: false, res: fail('invalid-position', 'The supplied position is not a valid longitude/latitude.') };
  }
  return { ok: true, event: { eventAtUtc: input.eventAtUtc, confirmedAtUtc: nowUtc, positionLonLatDeg: input.positionLonLatDeg } };
}

/** Human confirms the changeover STARTED. Not inferred from GPS or from the planned time. */
export function confirmStart(entry: ChangeoverLogEntry, input: EventInput, nowUtc: string): LogResult {
  if (entry.actualStart !== null) return fail('already-confirmed', 'Start is already confirmed. Use an override with a reason to correct it.');
  const built = buildEvent(input, nowUtc);
  if (!built.ok) return built.res;
  return { ok: true, entry: { ...entry, actualStart: built.event } };
}

/** Human confirms the changeover COMPLETED. Requires a confirmed start. Not inferred from GPS. */
export function confirmCompletion(entry: ChangeoverLogEntry, input: EventInput, nowUtc: string): LogResult {
  if (entry.actualStart === null) return fail('start-missing', 'Confirm the start before confirming completion.');
  if (entry.actualCompletion !== null) return fail('already-confirmed', 'Completion is already confirmed. Use an override with a reason to correct it.');
  const built = buildEvent(input, nowUtc);
  if (!built.ok) return built.res;
  if ((parseIsoUtc(built.event.eventAtUtc) as number) < (parseIsoUtc(entry.actualStart.eventAtUtc) as number)) {
    return fail('completion-before-start', 'Completion cannot be earlier than the confirmed start.');
  }
  return { ok: true, entry: { ...entry, actualCompletion: built.event } };
}

/** Record that the person saw an alert. Idempotent per alert id. */
export function acknowledgeAlert(entry: ChangeoverLogEntry, alertId: string, nowUtc: string): LogResult {
  if (typeof alertId !== 'string' || alertId.trim() === '') return fail('invalid-id', 'An alert acknowledgment needs an alert id.');
  if (parseIsoUtc(nowUtc) === null) return fail('invalid-timestamp', 'Current time is not valid ISO UTC.');
  if (entry.acknowledgments.some((a) => a.alertId === alertId)) return { ok: true, entry };
  return { ok: true, entry: { ...entry, acknowledgments: [...entry.acknowledgments, { alertId, acknowledgedAtUtc: nowUtc }] } };
}

export interface OverrideInput {
  readonly field: OverridableField;
  /** ISO UTC for actualStart/actualCompletion; minutes (≥ 0) for duration/margin. */
  readonly newValue: string | number;
  readonly reason: string;
}

/** Correct a recorded value. The previous value and a mandatory reason are kept; nothing is silently overwritten. */
export function applyOverride(entry: ChangeoverLogEntry, input: OverrideInput, nowUtc: string): LogResult {
  if (typeof input.reason !== 'string' || input.reason.trim() === '') return fail('reason-required', 'An override needs a written reason.');
  if (parseIsoUtc(nowUtc) === null) return fail('invalid-timestamp', 'Current time is not valid ISO UTC.');
  const { field, newValue } = input;

  if (field === 'actualStart' || field === 'actualCompletion') {
    const existing = field === 'actualStart' ? entry.actualStart : entry.actualCompletion;
    if (existing === null) return fail('nothing-to-override', `There is no recorded ${field === 'actualStart' ? 'start' : 'completion'} to override.`);
    if (typeof newValue !== 'string') return fail('invalid-timestamp', 'The new event time must be an ISO UTC string.');
    const built = buildEvent({ eventAtUtc: newValue, positionLonLatDeg: existing.positionLonLatDeg }, nowUtc);
    if (!built.ok) return built.res;
    const newMs = parseIsoUtc(newValue) as number;
    if (field === 'actualStart' && entry.actualCompletion !== null && newMs > (parseIsoUtc(entry.actualCompletion.eventAtUtc) as number)) {
      return fail('completion-before-start', 'The corrected start would be later than the recorded completion.');
    }
    if (field === 'actualCompletion' && entry.actualStart !== null && newMs < (parseIsoUtc(entry.actualStart.eventAtUtc) as number)) {
      return fail('completion-before-start', 'Completion cannot be earlier than the confirmed start.');
    }
    const record: OverrideRecord = { field, previousValue: existing.eventAtUtc, newValue, reason: input.reason.trim(), recordedAtUtc: nowUtc };
    const updated: HumanEvent = { ...existing, eventAtUtc: newValue, confirmedAtUtc: nowUtc };
    return {
      ok: true,
      entry: {
        ...entry,
        ...(field === 'actualStart' ? { actualStart: updated } : { actualCompletion: updated }),
        overrides: [...entry.overrides, record],
      },
    };
  }

  if (typeof newValue !== 'number' || !Number.isFinite(newValue) || newValue < 0) {
    return fail('invalid-value', 'The new value must be a finite number of minutes ≥ 0.');
  }
  const previous = field === 'duration' ? entry.plan.durationMinutes : entry.plan.marginMinutes;
  const record: OverrideRecord = { field, previousValue: previous, newValue, reason: input.reason.trim(), recordedAtUtc: nowUtc };
  const plan: PlanSnapshot = field === 'duration' ? { ...entry.plan, durationMinutes: newValue } : { ...entry.plan, marginMinutes: newValue };
  return { ok: true, entry: { ...entry, plan, overrides: [...entry.overrides, record] } };
}

export function setNotes(entry: ChangeoverLogEntry, notes: string): ChangeoverLogEntry {
  return { ...entry, notes };
}

/** Minutes between the HUMAN-confirmed start and completion times; null unless both exist. Not a GPS or engine result. */
export function actualDurationMinutes(entry: ChangeoverLogEntry): number | null {
  if (entry.actualStart === null || entry.actualCompletion === null) return null;
  const s = parseIsoUtc(entry.actualStart.eventAtUtc);
  const c = parseIsoUtc(entry.actualCompletion.eventAtUtc);
  if (s === null || c === null || c < s) return null;
  return (c - s) / MS_PER_MINUTE;
}

export type LogEntryState = 'planned' | 'started' | 'completed';
export function logEntryState(entry: ChangeoverLogEntry): LogEntryState {
  if (entry.actualCompletion !== null) return 'completed';
  if (entry.actualStart !== null) return 'started';
  return 'planned';
}

/** Defensive parse for data read back from storage. Returns null for anything that is not a well-formed entry. */
export function parseLogEntry(value: unknown): ChangeoverLogEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== LOG_SCHEMA_VERSION) return null;
  if (typeof v.id !== 'string' || v.id === '' || parseIsoUtc(v.createdAtUtc) === null) return null;
  if (v.positionSource !== 'simulator' && v.positionSource !== 'browser-gps' && v.positionSource !== 'unavailable') return null;
  if (typeof v.isSimulated !== 'boolean' || v.isSimulated !== (v.positionSource === 'simulator')) return null;
  if (typeof v.plan !== 'object' || v.plan === null) return null;
  if (!Array.isArray(v.acknowledgments) || !Array.isArray(v.overrides) || typeof v.notes !== 'string') return null;
  for (const k of ['actualStart', 'actualCompletion'] as const) {
    const e = v[k];
    if (e === null) continue;
    if (typeof e !== 'object' || e === undefined) return null;
    const ev = e as Record<string, unknown>;
    if (parseIsoUtc(ev.eventAtUtc) === null || parseIsoUtc(ev.confirmedAtUtc) === null) return null;
  }
  return value as ChangeoverLogEntry;
}
