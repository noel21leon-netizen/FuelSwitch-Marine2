import type { LogStore } from '../../../application/ports';
import { createLogStore, type LogBackend } from './logStore';
import { database } from './localStore';

/** Production backend: the `logs` object store of the existing local database. Device-local, no network. */
export const indexedDbLogBackend: LogBackend = {
  async getAll() { return (await database()).getAll('logs'); },
  async put(id, value) { await (await database()).put('logs', value, id); },
};

export const indexedDbLogStore: LogStore = createLogStore(indexedDbLogBackend);
