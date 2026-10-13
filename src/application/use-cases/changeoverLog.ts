// Changeover log use cases (FR-009, FR-012). Wraps the pure domain log with persistence.
// Time and ids are INJECTED (ADR-020/029): no clock, crypto or timers in application code.
// Events are only ever confirmed by a person; nothing here reads GPS to decide that a changeover started or finished.
import {
  acknowledgeAlert, applyOverride, confirmCompletion, confirmStart, createLogEntry, exportFileName, exportLogCsv,
  exportMetadataText, setNotes,
  type ChangeoverLogEntry, type DatasetSnapshot, type LogErrorReason, type LogPositionSource, type LogResult,
  type LonLat, type OverrideInput, type PlanSnapshot, type RegulatoryDataset,
} from '../../domain';
import type { LogStore } from '../ports';
import type { MonitoringSnapshot } from './monitoring';

export type PositionMode = 'simulator' | 'gps';

export interface LogDraft {
  readonly positionSource: LogPositionSource;
  readonly dataset: DatasetSnapshot | null;
  readonly plan: PlanSnapshot;
}

/** Snapshot the CURRENT plan for a new log entry. Missing pieces stay null; nothing is invented. */
export function buildLogDraft(snapshot: MonitoringSnapshot | null, dataset: RegulatoryDataset | null, mode: PositionMode): LogDraft {
  const plan = snapshot?.plan;
  const available = plan?.status === 'available' ? plan : null;
  const overdue = plan?.status === 'unavailable' && plan.reason === 'start-overdue' ? plan.details ?? null : null;
  return {
    positionSource: mode === 'simulator' ? 'simulator' : snapshot?.position.ok ? 'browser-gps' : 'unavailable',
    dataset: dataset ? { name: dataset.name, version: dataset.datasetVersion, verificationStatus: dataset.verificationStatus } : null,
    plan: {
      plannedStartAtUtc: available?.plannedStartAtUtc ?? overdue?.plannedStartAtUtc ?? null,
      predictedCrossingAtUtc: available?.predictedCrossingAtUtc ?? null,
      plannedStartPointLonLatDeg: available?.plannedStartPointLonLatDeg ?? null,
      durationMinutes: available?.durationMinutes ?? null,
      durationMethod: available?.durationMethod ?? null,
      durationLabel: available?.durationLabel ?? null,
      marginMinutes: available?.marginMinutes ?? null,
    },
  };
}

/** Current valid position as [lon, lat], or null. Used only as optional context when a person confirms an event. */
export function currentPositionLonLat(snapshot: MonitoringSnapshot | null): LonLat | null {
  return snapshot?.position.ok ? [snapshot.position.position.longitudeDeg, snapshot.position.position.latitudeDeg] : null;
}

export interface LogServiceDeps {
  readonly store: LogStore;
  readonly clock: () => string;
  readonly newId: () => string;
}

export type LogActionResult =
  | { readonly ok: true; readonly entry: ChangeoverLogEntry; readonly savedOnDevice: boolean; readonly saveError: string | null }
  | { readonly ok: false; readonly reason: LogErrorReason | 'not-found'; readonly explanation: string };

export interface LogLoadStatus { readonly rejectedCount: number; readonly loadError: string | null }

export class ChangeoverLogService {
  private entries: ChangeoverLogEntry[] = [];

  constructor(private readonly deps: LogServiceDeps) {}

  /** Newest first. */
  list(): readonly ChangeoverLogEntry[] { return this.entries; }

  async load(): Promise<LogLoadStatus> {
    try {
      const loaded = await this.deps.store.loadAll();
      this.entries = [...loaded.entries];
      return { rejectedCount: loaded.rejectedCount, loadError: null };
    } catch (e) {
      return { rejectedCount: 0, loadError: `The saved log could not be read on this device: ${String(e)}` };
    }
  }

  create(draft: LogDraft, notes = ''): Promise<LogActionResult> {
    const r = createLogEntry({ id: this.deps.newId(), positionSource: draft.positionSource, dataset: draft.dataset, plan: draft.plan, notes }, this.deps.clock());
    return this.commit(r);
  }

  confirmStart(id: string, eventAtUtc: string, positionLonLatDeg: LonLat | null): Promise<LogActionResult> {
    return this.mutate(id, (e) => confirmStart(e, { eventAtUtc, positionLonLatDeg }, this.deps.clock()));
  }

  confirmCompletion(id: string, eventAtUtc: string, positionLonLatDeg: LonLat | null): Promise<LogActionResult> {
    return this.mutate(id, (e) => confirmCompletion(e, { eventAtUtc, positionLonLatDeg }, this.deps.clock()));
  }

  acknowledge(id: string, alertId: string): Promise<LogActionResult> {
    return this.mutate(id, (e) => acknowledgeAlert(e, alertId, this.deps.clock()));
  }

  override(id: string, input: OverrideInput): Promise<LogActionResult> {
    return this.mutate(id, (e) => applyOverride(e, input, this.deps.clock()));
  }

  saveNotes(id: string, notes: string): Promise<LogActionResult> {
    return this.mutate(id, (e) => ({ ok: true, entry: setNotes(e, notes) }));
  }

  /** CSV text, file name and a short summary. Pure formatting of what is in memory. */
  exportCsv(): { readonly csv: string; readonly fileName: string; readonly summary: string; readonly entryCount: number } {
    const now = this.deps.clock();
    return { csv: exportLogCsv(this.entries, now), fileName: exportFileName(now), summary: exportMetadataText(this.entries, now), entryCount: this.entries.length };
  }

  private mutate(id: string, op: (entry: ChangeoverLogEntry) => LogResult): Promise<LogActionResult> {
    const existing = this.entries.find((e) => e.id === id);
    if (!existing) return Promise.resolve({ ok: false, reason: 'not-found', explanation: 'That log entry no longer exists.' });
    return this.commit(op(existing));
  }

  /** Keep the change in memory first, then try to persist; report honestly if the device could not store it. */
  private async commit(result: LogResult): Promise<LogActionResult> {
    if (!result.ok) return result;
    const entry = result.entry;
    const index = this.entries.findIndex((e) => e.id === entry.id);
    if (index >= 0) this.entries[index] = entry; else this.entries = [entry, ...this.entries];
    try {
      await this.deps.store.put(entry);
      return { ok: true, entry, savedOnDevice: true, saveError: null };
    } catch (e) {
      return { ok: true, entry, savedOnDevice: false, saveError: `Could not save on this device: ${String(e)}` };
    }
  }
}
