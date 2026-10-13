// REAL IndexedDB path via fake-indexeddb (devDependency). Written in chunk 5B; NOT RUN in the 5B sandbox (package not installed, no network).
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createLogEntry } from '../../src/domain';
import { indexedDbLogStore } from '../../src/infrastructure/persistence/indexeddb/indexedDbLogStore';

describe('indexedDbLogStore (fake-indexeddb)', () => {
  it('persists an entry and reads it back after a fresh loadAll', async () => {
    const r = createLogEntry({
      id: 'idb-1', positionSource: 'simulator', dataset: null,
      plan: { plannedStartAtUtc: null, predictedCrossingAtUtc: null, plannedStartPointLonLatDeg: null, durationMinutes: 45, durationMethod: 'manual-verified', durationLabel: 'x', marginMinutes: 15 },
    }, '2026-10-12T06:00:00Z');
    if (!r.ok) throw new Error(r.explanation);
    await indexedDbLogStore.put(r.entry);
    const loaded = await indexedDbLogStore.loadAll();
    expect(loaded.rejectedCount).toBe(0);
    expect(loaded.entries.map((e) => e.id)).toEqual(['idb-1']);
    expect(loaded.entries[0]?.plan.durationMinutes).toBe(45);
  });
});
