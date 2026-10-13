// FR-012: CSV export of the changeover log. SYNTHETIC/SIMULATED test data only.
import { describe, it, expect } from 'vitest';
import {
  CSV_COLUMNS, DEMO_BANNER_TEXT_FOR_TESTS, csvCell, createLogEntry, confirmCompletion, confirmStart, exportFileName,
  exportLogCsv, exportMetadataText, neutraliseFormula, provenanceLabel, acknowledgeAlert, applyOverride, setNotes,
  type ChangeoverLogEntry,
} from './csv-helpers';

const NOW = '2026-10-12T06:00:00Z';
const PLAN = {
  plannedStartAtUtc: '2026-10-12T08:00:00Z', predictedCrossingAtUtc: '2026-10-12T09:00:00Z', plannedStartPointLonLatDeg: [-1.5, 0.25] as const,
  durationMinutes: 45, durationMethod: 'manual-verified' as const, durationLabel: 'Manually entered duration (user-verified; NOT a FOBAS result)', marginMinutes: 15,
};
function make(id: string, source: 'simulator' | 'browser-gps', status: 'synthetic' | 'verified' | 'unverified' | 'expired', at = NOW): ChangeoverLogEntry {
  const r = createLogEntry({ id, positionSource: source, dataset: { name: 'Test ECA', version: 'v1', verificationStatus: status }, plan: PLAN }, at);
  if (!r.ok) throw new Error(r.explanation);
  return r.entry;
}
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []; let cur: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { cur.push(cell); cell = ''; }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
    else cell += ch;
  }
  return rows;
};
const col = (row: string[], name: (typeof CSV_COLUMNS)[number]): string => row[CSV_COLUMNS.indexOf(name)] ?? '<missing>';

describe('csvCell / neutraliseFormula', () => {
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
  });
  it('neutralises formula starts in TEXT cells but leaves numbers (negative coordinates) untouched', () => {
    expect(neutraliseFormula('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(neutraliseFormula('@cmd')).toBe("'@cmd");
    expect(csvCell('+1 note', 'text')).toBe("'+1 note");
    expect(csvCell(-1.5)).toBe('-1.5');
    expect(csvCell(null)).toBe('');
  });
});

describe('exportLogCsv', () => {
  it('header has every column exactly once, in order, and rows have the same width', () => {
    const rows = parseCsv(exportLogCsv([make('a', 'simulator', 'synthetic')], NOW));
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(new Set(CSV_COLUMNS).size).toBe(CSV_COLUMNS.length);
    expect(rows[1]).toHaveLength(CSV_COLUMNS.length);
  });
  it('uses CRLF line endings and ends with a newline', () => {
    const t = exportLogCsv([make('a', 'simulator', 'synthetic')], NOW);
    expect(t.endsWith('\r\n')).toBe(true);
    expect(t.split('\r\n')).toHaveLength(3);
  });
  it('header-only CSV when there are no entries', () => {
    expect(parseCsv(exportLogCsv([], NOW))).toHaveLength(1);
  });
  it('labels simulated entries SIMULATED with the DEMO notice, and never as verified', () => {
    const row = parseCsv(exportLogCsv([make('s', 'simulator', 'synthetic')], NOW))[1] as string[];
    expect(col(row, 'provenance')).toContain('SIMULATED');
    expect(col(row, 'data_notice')).toBe(DEMO_BANNER_TEXT_FOR_TESTS);
    expect(col(row, 'position_source')).toBe('simulator');
  });
  it('labels a planned GPS entry as PLANNED, a confirmed one as MANUAL, and unverified boundary data as not verified', () => {
    const planned = make('p', 'browser-gps', 'unverified');
    expect(provenanceLabel(planned)).toContain('PLANNED');
    expect(provenanceLabel(planned)).toContain('UNVERIFIED');
    const s = confirmStart(planned, { eventAtUtc: NOW, positionLonLatDeg: null }, NOW);
    if (!s.ok) throw new Error(s.explanation);
    expect(provenanceLabel(s.entry)).toContain('MANUAL');
    expect(provenanceLabel(make('v', 'browser-gps', 'verified'))).toContain('boundary data VERIFIED');
  });
  it('flags expired boundary data in the notice column', () => {
    const row = parseCsv(exportLogCsv([make('x', 'browser-gps', 'expired')], NOW))[1] as string[];
    expect(col(row, 'data_notice')).toContain('EXPIRED');
  });
  it('writes ISO UTC timestamps, plan fields, rounded coordinates and the duration source label', () => {
    const row = parseCsv(exportLogCsv([make('a', 'simulator', 'synthetic')], NOW))[1] as string[];
    expect(col(row, 'created_at_utc')).toBe(NOW);
    expect(col(row, 'planned_start_utc')).toBe('2026-10-12T08:00:00Z');
    expect(col(row, 'planned_start_longitude_deg')).toBe('-1.5');
    expect(col(row, 'planned_start_latitude_deg')).toBe('0.25');
    expect(col(row, 'planned_duration_min')).toBe('45');
    expect(col(row, 'duration_source')).toContain('NOT a FOBAS result');
    expect(col(row, 'safety_margin_min')).toBe('15');
  });
  it('human events, derived duration, acknowledgments, overrides and notes are all present', () => {
    let e = make('full', 'browser-gps', 'unverified');
    const step = (r: ReturnType<typeof createLogEntry>): ChangeoverLogEntry => { if (!r.ok) throw new Error(r.explanation); return r.entry; };
    e = step(confirmStart(e, { eventAtUtc: '2026-10-12T05:00:00Z', positionLonLatDeg: [-1.51234567, 0.2] }, NOW));
    e = step(confirmCompletion(e, { eventAtUtc: '2026-10-12T05:48:00Z', positionLonLatDeg: null }, NOW));
    e = step(acknowledgeAlert(e, 'alert-30', NOW));
    e = step(applyOverride(e, { field: 'duration', newValue: 50, reason: 'Re-verified, with "quotes", commas' }, NOW));
    e = setNotes(e, '=HYPERLINK("http://x")');
    const row = parseCsv(exportLogCsv([e], NOW))[1] as string[];
    expect(col(row, 'actual_start_utc')).toBe('2026-10-12T05:00:00Z');
    expect(col(row, 'actual_start_longitude_deg')).toBe('-1.51235');
    expect(col(row, 'actual_completion_latitude_deg')).toBe('');
    expect(col(row, 'actual_duration_min_human_entered')).toBe('48');
    expect(col(row, 'acknowledged_alert_count')).toBe('1');
    expect(col(row, 'acknowledgments')).toBe(`alert-30@${NOW}`);
    expect(col(row, 'overrides')).toContain('duration: 45 -> 50');
    expect(col(row, 'overrides')).toContain('"quotes", commas');
    expect(col(row, 'notes')).toBe(`'=HYPERLINK("http://x")`);
  });
  it('sorts by creation time then id, independent of input order', () => {
    const a = make('b', 'simulator', 'synthetic', '2026-10-12T05:00:00Z');
    const b = make('a', 'simulator', 'synthetic', '2026-10-12T05:00:00Z');
    const c = make('c', 'simulator', 'synthetic', '2026-10-12T04:00:00Z');
    const ids = parseCsv(exportLogCsv([a, b, c], NOW)).slice(1).map((r) => col(r, 'entry_id'));
    expect(ids).toEqual(['c', 'a', 'b']);
  });
  it('rejects an invalid export timestamp', () => {
    expect(() => exportLogCsv([], 'today')).toThrow();
  });
});

describe('export metadata and file name', () => {
  it('counts simulated entries and states the advisory limits', () => {
    const t = exportMetadataText([make('a', 'simulator', 'synthetic'), make('b', 'browser-gps', 'unverified')], NOW);
    expect(t).toContain('Entries: 2 (simulated: 1)');
    expect(t).toContain('Not an approved navigation system');
    expect(t).toContain('not derived from GPS');
  });
  it('builds a filesystem-safe name from the export time', () => {
    expect(exportFileName('2026-10-12T06:30:15.123Z')).toBe('fuelswitch-changeover-log-20261012T063015Z.csv');
    expect(exportFileName(NOW)).toBe('fuelswitch-changeover-log-20261012T060000Z.csv');
  });
});
