import type { LogLoadResult, LogStore } from '../../../application/ports';
import { parseLogEntry, type ChangeoverLogEntry } from '../../../domain';

/** Minimal storage backend so the validation/ordering logic is testable without a browser database. */
export interface LogBackend {
  getAll(): Promise<unknown[]>;
  put(id: string, value: unknown): Promise<void>;
}

export function createLogStore(backend: LogBackend): LogStore {
  return {
    async loadAll(): Promise<LogLoadResult> {
      const raw = await backend.getAll();
      const entries: ChangeoverLogEntry[] = [];
      let rejectedCount = 0;
      for (const item of raw) {
        const parsed = parseLogEntry(item);
        if (parsed === null) rejectedCount += 1; else entries.push(parsed);
      }
      entries.sort((a, b) => (a.createdAtUtc < b.createdAtUtc ? 1 : a.createdAtUtc > b.createdAtUtc ? -1 : a.id.localeCompare(b.id)));
      return { entries, rejectedCount };
    },
    async put(entry: ChangeoverLogEntry): Promise<void> {
      await backend.put(entry.id, entry);
    },
  };
}
