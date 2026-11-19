import type { StoragePort } from '../../ports/StoragePort';

/**
 * Web storage port backed by `window.localStorage` — the same store the
 * app persists to today (theme key, settings). String values only; the
 * app JSON-serialises on both sides.
 */
export class LocalStoragePort implements StoragePort {
  constructor(private readonly store: Storage = window.localStorage) {}

  async setItem(key: string, value: string): Promise<void> {
    this.store.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.store.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    this.store.removeItem(key);
  }

  async hasItem(key: string): Promise<boolean> {
    return this.store.getItem(key) !== null;
  }

  async keys(prefix?: string): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < this.store.length; i += 1) {
      const key = this.store.key(i);
      if (key !== null && (prefix === undefined || key.startsWith(prefix))) out.push(key);
    }
    return out;
  }
}
