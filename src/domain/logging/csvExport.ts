// CSV export of the changeover log (pure). FR-012.
// RFC 4180 quoting; text cells starting with = + - @ are neutralised against spreadsheet formula injection.
// Numeric and timestamp cells are written as-is so negative coordinates stay numbers.
import { DEMO_BANNER_TEXT } from '../../shared/constants';
import { actualDurationMinutes, logEntryState, type ChangeoverLogEntry } from './changeoverLog';
import { parseIsoUtc } from '../units';

export const CSV_COLUMNS = [
  'entry_id', 'created_at_utc', 'record_state', 'provenance', 'data_notice',
  'position_source', 'boundary_dataset_name', 'boundary_dataset_version', 'boundary_dataset_status',
  'planned_start_utc', 'predicted_crossing_utc', 'planned_start_longitude_deg', 'planned_start_latitude_deg',
  'planned_duration_min', 'duration_source', 'safety_margin_min',
  'actual_start_utc', 'actual_start_confirmed_at_utc', 'actual_start_longitude_deg', 'actual_start_latitude_deg',
  'actual_completion_utc', 'actual_completion_confirmed_at_utc', 'actual_completion_longitude_deg', 'actual_completion_latitude_deg',
  'actual_duration_min_human_entered', 'acknowledged_alert_count', 'acknowledgments', 'overrides', 'notes',
] as const;

/** Provenance label for an entry. SIMULATED entries are never labelled as real events. */
export function provenanceLabel(entry: ChangeoverLogEntry): string {
  if (entry.isSimulated) return 'SIMULATED — not a real event';
  const status = entry.dataset?.verificationStatus;
  const humanConfirmed = entry.actualStart !== null || entry.actualCompletion !== null;
  const base = humanConfirmed ? 'MANUAL — human-confirmed times' : 'PLANNED — no human confirmation yet';
  if (status === 'verified') return `${base}; boundary data VERIFIED`;
  return `${base}; boundary data ${(status ?? 'unknown').toUpperCase()} — not verified for operational use`;
}

/** Notice column: DEMO text whenever data is synthetic or simulated. */
function dataNotice(entry: ChangeoverLogEntry): string {
  if (entry.isSimulated || entry.dataset?.verificationStatus === 'synthetic') return DEMO_BANNER_TEXT;
  if (entry.dataset?.verificationStatus === 'expired') return 'EXPIRED BOUNDARY DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE';
  return 'ADVISORY ONLY — NOT AN APPROVED NAVIGATION SYSTEM';
}

export function neutraliseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(value: string | number | null | undefined, kind: 'text' | 'raw' = 'raw'): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? String(value) : value;
  if (kind === 'text') s = neutraliseFormula(s);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (v: number | null | undefined, digits: number): number | null => (v === null || v === undefined ? null : Number(v.toFixed(digits)));

function row(entry: ChangeoverLogEntry): string {
  const p = entry.plan.plannedStartPointLonLatDeg;
  const s = entry.actualStart?.positionLonLatDeg ?? null;
  const c = entry.actualCompletion?.positionLonLatDeg ?? null;
  const actual = actualDurationMinutes(entry);
  const cells: (string | number | null)[] = [
    csvCell(entry.id, 'text'), csvCell(entry.createdAtUtc), csvCell(logEntryState(entry)), csvCell(provenanceLabel(entry), 'text'), csvCell(dataNotice(entry), 'text'),
    csvCell(entry.positionSource), csvCell(entry.dataset?.name ?? null, 'text'), csvCell(entry.dataset?.version ?? null, 'text'), csvCell(entry.dataset?.verificationStatus ?? null),
    csvCell(entry.plan.plannedStartAtUtc), csvCell(entry.plan.predictedCrossingAtUtc), csvCell(num(p?.[0], 5)), csvCell(num(p?.[1], 5)),
    csvCell(entry.plan.durationMinutes), csvCell(entry.plan.durationLabel, 'text'), csvCell(entry.plan.marginMinutes),
    csvCell(entry.actualStart?.eventAtUtc ?? null), csvCell(entry.actualStart?.confirmedAtUtc ?? null), csvCell(num(s?.[0], 5)), csvCell(num(s?.[1], 5)),
    csvCell(entry.actualCompletion?.eventAtUtc ?? null), csvCell(entry.actualCompletion?.confirmedAtUtc ?? null), csvCell(num(c?.[0], 5)), csvCell(num(c?.[1], 5)),
    csvCell(num(actual, 1)), csvCell(entry.acknowledgments.length),
    csvCell(entry.acknowledgments.map((a) => `${a.alertId}@${a.acknowledgedAtUtc}`).join('; '), 'text'),
    csvCell(entry.overrides.map((o) => `${o.field}: ${String(o.previousValue)} -> ${String(o.newValue)} @${o.recordedAtUtc} (${o.reason})`).join(' | '), 'text'),
    csvCell(entry.notes, 'text'),
  ];
  return cells.join(',');
}

/** Build the CSV text. `exportedAtUtc` is injected (no clock reads). Lines end with CRLF per RFC 4180. */
export function exportLogCsv(entries: readonly ChangeoverLogEntry[], exportedAtUtc: string): string {
  if (parseIsoUtc(exportedAtUtc) === null) throw new RangeError('exportedAtUtc must be valid ISO UTC');
  const lines = [CSV_COLUMNS.join(',')];
  for (const e of [...entries].sort((a, b) => (a.createdAtUtc < b.createdAtUtc ? -1 : a.createdAtUtc > b.createdAtUtc ? 1 : a.id.localeCompare(b.id)))) lines.push(row(e));
  return `${lines.join('\r\n')}\r\n`;
}

/** Plain-text header block for a printable report or file name use; kept separate so the CSV stays machine-readable. */
export function exportMetadataText(entries: readonly ChangeoverLogEntry[], exportedAtUtc: string): string {
  const simulated = entries.filter((e) => e.isSimulated).length;
  return [
    'FuelSwitch Marine — ECA Changeover Assistant — changeover log export',
    `Exported (UTC): ${exportedAtUtc}`,
    `Entries: ${entries.length} (simulated: ${simulated})`,
    'Times are ISO 8601 UTC. "Human-entered" values were typed/confirmed by a person; they are not derived from GPS.',
    'Advisory prototype. Not an approved navigation system. No compliance claim is made.',
  ].join('\n');
}

export function exportFileName(exportedAtUtc: string): string {
  return `fuelswitch-changeover-log-${exportedAtUtc.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.csv`;
}
