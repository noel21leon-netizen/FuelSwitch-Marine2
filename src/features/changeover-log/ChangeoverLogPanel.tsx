import { useState } from 'react';
import {
  actualDurationMinutes, logEntryState, provenanceLabel,
  type ChangeoverLogEntry, type OverridableField,
} from '../../domain';
import {
  buildLogDraft, currentPositionLonLat, type ChangeoverLogService, type PositionMode,
} from '../../application/use-cases/changeoverLog';
import type { AlertRecord, MonitoringSnapshot } from '../../application/use-cases/monitoring';
import type { RegulatoryDataset } from '../../domain';
import { DEMO_BANNER_TEXT } from '../../shared/constants';
import { copyText, downloadTextFile } from './download';
import { localInputToUtcIso } from './timeInput';
import { useChangeoverLog } from './useChangeoverLog';

export interface ChangeoverLogPanelProps {
  readonly service: ChangeoverLogService;
  readonly snapshot: MonitoringSnapshot | null;
  readonly dataset: RegulatoryDataset | null;
  readonly mode: PositionMode;
  /** Alerts raised during this session (not persisted by themselves; acknowledging one records it in the entry). */
  readonly sessionAlerts: readonly AlertRecord[];
  /** Current time as ISO UTC (simulated time in simulator mode). */
  readonly clock: () => string;
}

const local = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : 'Not set');

function EntryCard({ entry, props, run }: { entry: ChangeoverLogEntry; props: ChangeoverLogPanelProps; run: ReturnType<typeof useChangeoverLog>['run'] }) {
  const { service, snapshot, sessionAlerts, clock } = props;
  const state = logEntryState(entry);
  const [when, setWhen] = useState('');
  const [field, setField] = useState<OverridableField>('duration');
  const [overrideValue, setOverrideValue] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotesText] = useState(entry.notes);
  const [formError, setFormError] = useState('');
  const position = currentPositionLonLat(snapshot);
  const actual = actualDurationMinutes(entry);
  const isTimeField = field === 'actualStart' || field === 'actualCompletion';

  const eventTime = (): string | null => (when === '' ? clock() : localInputToUtcIso(when));

  async function confirm(kind: 'start' | 'completion') {
    const at = eventTime();
    if (at === null) { setFormError('Enter a valid date and time.'); return; }
    setFormError('');
    const action = kind === 'start' ? service.confirmStart(entry.id, at, position) : service.confirmCompletion(entry.id, at, position);
    await run(action, kind === 'start' ? 'Start recorded as confirmed by you.' : 'Completion recorded as confirmed by you.');
    setWhen('');
  }
  async function override() {
    let value: string | number | null;
    if (isTimeField) value = localInputToUtcIso(overrideValue);
    else value = overrideValue.trim() === '' ? null : Number(overrideValue);
    if (value === null || (typeof value === 'number' && !Number.isFinite(value))) { setFormError('Enter a valid new value.'); return; }
    setFormError('');
    const result = await run(service.override(entry.id, { field, newValue: value, reason }), 'Correction recorded (previous value kept).');
    if (result.ok) { setReason(''); setOverrideValue(''); }
  }

  return <article className="log-entry">
    <header className="log-entry__head">
      <strong>{state.toUpperCase()}</strong>
      {entry.isSimulated && <span className="chip chip--simulated">SIMULATED</span>}
      <span className="muted">Created {local(entry.createdAtUtc)}</span>
    </header>
    {(entry.isSimulated || entry.dataset?.verificationStatus === 'synthetic') && <p className="banner-demo" role="note">{DEMO_BANNER_TEXT}</p>}
    <p className="muted">{provenanceLabel(entry)}</p>
    <dl className="metrics">
      <dt>Planned start</dt><dd>{local(entry.plan.plannedStartAtUtc)}</dd>
      <dt>Predicted crossing</dt><dd>{local(entry.plan.predictedCrossingAtUtc)}</dd>
      <dt>Duration</dt><dd>{entry.plan.durationMinutes === null ? 'Not set' : `${entry.plan.durationMinutes} min — ${entry.plan.durationLabel ?? 'source not recorded'}`}</dd>
      <dt>Safety margin</dt><dd>{entry.plan.marginMinutes === null ? 'Not set' : `${entry.plan.marginMinutes} min`}</dd>
      <dt>Boundary data</dt><dd>{entry.dataset ? `${entry.dataset.name} · v${entry.dataset.version} · ${entry.dataset.verificationStatus.toUpperCase()}` : 'Unavailable'}</dd>
      <dt>Confirmed start</dt><dd>{entry.actualStart ? `${local(entry.actualStart.eventAtUtc)} (${entry.actualStart.positionLonLatDeg ? `${entry.actualStart.positionLonLatDeg[1].toFixed(4)}, ${entry.actualStart.positionLonLatDeg[0].toFixed(4)}` : 'no position'})` : 'Not confirmed'}</dd>
      <dt>Confirmed completion</dt><dd>{entry.actualCompletion ? `${local(entry.actualCompletion.eventAtUtc)} (${entry.actualCompletion.positionLonLatDeg ? `${entry.actualCompletion.positionLonLatDeg[1].toFixed(4)}, ${entry.actualCompletion.positionLonLatDeg[0].toFixed(4)}` : 'no position'})` : 'Not confirmed'}</dd>
      <dt>Actual duration</dt><dd>{actual === null ? 'Unavailable until both times are confirmed' : `${actual.toFixed(0)} min (from the times you entered)`}</dd>
      <dt>Alerts acknowledged</dt><dd>{entry.acknowledgments.length}</dd>
      <dt>Corrections</dt><dd>{entry.overrides.length}</dd>
    </dl>

    {state !== 'completed' && <div className="log-form">
      <label>{state === 'planned' ? 'When did the changeover start?' : 'When did the changeover complete?'}
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <p className="muted">Leave empty to use the current time. Entered in this device's local time; stored as UTC. {position ? 'The current position will be attached.' : 'No valid position fix — none will be attached.'}</p>
      <button type="button" onClick={() => void confirm(state === 'planned' ? 'start' : 'completion')}>{state === 'planned' ? 'Confirm changeover STARTED' : 'Confirm changeover COMPLETED'}</button>
    </div>}

    {sessionAlerts.length > 0 && <div className="log-form"><strong>Alerts this session</strong>
      {sessionAlerts.map((a) => {
        const done = entry.acknowledgments.some((x) => x.alertId === a.alert.id);
        return <button key={a.alert.id} type="button" disabled={done} onClick={() => void run(service.acknowledge(entry.id, a.alert.id), 'Alert acknowledged.')}>{done ? 'Acknowledged: ' : 'Acknowledge: '}{a.alert.message}</button>;
      })}
    </div>}

    <details className="log-form"><summary>Correct a value</summary>
      <label>Value to correct
        <select value={field} onChange={(e) => { setField(e.target.value as OverridableField); setOverrideValue(''); }}>
          <option value="duration">Planned duration (min)</option>
          <option value="margin">Safety margin (min)</option>
          {entry.actualStart && <option value="actualStart">Confirmed start time</option>}
          {entry.actualCompletion && <option value="actualCompletion">Confirmed completion time</option>}
        </select>
      </label>
      <label>New value
        {isTimeField
          ? <input type="datetime-local" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} />
          : <input type="number" min="0" inputMode="decimal" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} />}
      </label>
      <label>Reason (required)<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button type="button" onClick={() => void override()}>Record correction</button>
    </details>

    <label>Notes<textarea rows={2} value={notes} onChange={(e) => setNotesText(e.target.value)} /></label>
    <button type="button" onClick={() => void run(service.saveNotes(entry.id, notes), 'Notes saved.')}>Save notes</button>
    {formError && <p role="alert">{formError}</p>}
  </article>;
}

export function ChangeoverLogPanel(props: ChangeoverLogPanelProps) {
  const { service, snapshot, dataset, mode } = props;
  const { state, run } = useChangeoverLog(service);
  const [exportNote, setExportNote] = useState('');

  async function exportCsv(kind: 'download' | 'copy') {
    const out = service.exportCsv();
    if (out.entryCount === 0) { setExportNote('There are no log entries to export.'); return; }
    const result = kind === 'download' ? downloadTextFile(out.fileName, out.csv) : await copyText(out.csv);
    setExportNote(`${result.detail}\n${out.summary}`);
  }

  return <section className="panel"><h2>Changeover log</h2>
    <p>This log records only what you confirm. Start and completion are never inferred from GPS or from the planned time.</p>
    {mode === 'simulator' && <p className="banner-demo" role="note">SIMULATED — entries created now are marked SIMULATED and are not real events.</p>}
    <button type="button" onClick={() => void run(service.create(buildLogDraft(snapshot, dataset, mode)), 'Log entry created from the current plan.')}>Create entry from current plan</button>
    {!state.loaded && <p className="muted">Loading saved entries…</p>}
    {state.status.loadError && <p role="alert">{state.status.loadError}</p>}
    {state.status.rejectedCount > 0 && <p role="alert">{state.status.rejectedCount} saved record(s) could not be read and were not loaded.</p>}
    {state.message && <p role="status" className={state.messageIsError ? 'alert' : 'notice'}>{state.message}</p>}
    {state.loaded && state.entries.length === 0 && <p className="muted">No log entries yet.</p>}
    {state.entries.map((entry) => <EntryCard key={entry.id} entry={entry} props={props} run={run} />)}
    <div className="log-form"><strong>Export</strong>
      <p className="muted">CSV with ISO UTC times and a provenance column (SIMULATED / PLANNED / MANUAL). Review before sharing.</p>
      <button type="button" onClick={() => void exportCsv('download')}>Download CSV</button>
      <button type="button" onClick={() => void exportCsv('copy')}>Copy CSV</button>
      {exportNote && <p role="status" className="notice" style={{ whiteSpace: 'pre-line' }}>{exportNote}</p>}
    </div>
  </section>;
}
