import { openDB, type IDBPDatabase } from 'idb';

/** Device-local storage for user-entered settings and future human-confirmed logs. No network sync. */
export interface LocalStore {
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<void>;
}

export type StoreSchema = { settings: { key: string; value: unknown }; logs: { key: string; value: unknown } };
const DATABASE = 'fuelswitch-local-v1';
let opening: Promise<IDBPDatabase<StoreSchema>> | null = null;

export function database(): Promise<IDBPDatabase<StoreSchema>> {
  opening ??= openDB<StoreSchema>(DATABASE, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs');
    },
  });
  return opening;
}

export const indexedDbLocalStore: LocalStore = {
  async read<T>(key: string) { return (await database()).get('settings', key) as Promise<T | undefined>; },
  async write<T>(key: string, value: T) { await (await database()).put('settings', value, key); },
};
