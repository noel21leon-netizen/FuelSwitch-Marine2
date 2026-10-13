// FR-009: log store validation/ordering over an in-memory backend (no browser database). Real IndexedDB: see log-store-idb.test.ts (NOT RUN in sandbox).
import { describe, it, expect } from 'vitest';
import { createLogEntry, type ChangeoverLogEntry } from '../../src/domain';
import { createLogStore, type LogBackend } from '../../src/infrastructure/persistence/indexeddb/logStore';

const PLAN = { plannedStartAtUtc: null, predictedCrossingAtUtc: null, plannedStartPointLonLatDeg: null, durationMinutes: null, durationMethod: null, durationLabel: null, marginMinutes: null };
function entry(id: string, at: string, source: 'simulator' | 'browser-gps' = 'simulator'): ChangeoverLogEntry {
  const r = createLogEntry({ id, positionSource: source, dataset: null, plan: PLAN }, at);
  if (!r.ok) throw new Error(r.explanation);
  return r.entry;
}
function memoryBackend(seed: unknown[] = []): LogBackend & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>(seed.map((v, i) => [`seed-${i}`, v]));
  return { rows, getAll: async () => [...rows.values()], put: async (id, v) => { rows.set(id, JSON.parse(JSON.stringify(v))); } };
}

describe('createLogStore', () => {
  it('round-trips entries through JSON-like storage', async () => {
    const backend = memoryBackend();
    const store = createLogStore(backend);
    const e = entry('a', '2026-10-12T05:00:00Z');
    await store.put(e);
    const loaded = await store.loadAll();
    expect(loaded.rejectedCount).toBe(0);
    expect(loaded.entries).toEqual([e]);
  });
  it('replaces by id rather than duplicating', async () => {
    const store = createLogStore(memoryBackend());
    await store.put(entry('a', '2026-10-12T05:00:00Z'));
    await store.put({ ...entry('a', '2026-10-12T05:00:00Z'), notes: 'changed' });
    const loaded = await store.loadAll();
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0]?.notes).toBe('changed');
  });
  it('returns newest first, ties broken by id', async () => {
    const store = createLogStore(memoryBackend());
    for (const e of [entry('b', '2026-10-12T05:00:00Z'), entry('a', '2026-10-12T05:00:00Z'), entry('c', '2026-10-12T06:00:00Z')]) await store.put(e);
    expect((await store.loadAll()).entries.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });
  it('counts and skips corrupted or foreign records instead of crashing', async () => {
    const good = entry('ok', '2026-10-12T05:00:00Z');
    const store = createLogStore(memoryBackend([good, null, 'text', { id: 'x' }, { ...good, schemaVersion: 2 }, { ...good, id: 'liar', isSimulated: false }]));
    const loaded = await store.loadAll();
    expect(loaded.entries.map((e) => e.id)).toEqual(['ok']);
    expect(loaded.rejectedCount).toBe(5);
  });
  it('propagates a storage failure from put so callers can report it', async () => {
    const store = createLogStore({ getAll: async () => [], put: async () => { throw new Error('quota'); } });
    let message = '';
    try { await store.put(entry('a', '2026-10-12T05:00:00Z')); } catch (e) { message = String(e); }
    expect(message).toContain('quota');
  });
});
