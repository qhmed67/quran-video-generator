/**
 * StoragePort — abstraction over persistent key/value storage.
 *
 * Used for saving projects, restoring settings and caching API responses
 * so the app works offline once content is fetched. String values keep
 * the port transport-neutral: the app serialises (JSON) on both sides.
 *
 * Web: `window.localStorage` (small, per-origin). Native: the app's
 * document directory. An IndexedDB-backed adapter can be added later for
 * larger payloads without touching callers.
 */
export interface StoragePort {
  /** Store `value` under `key`, replacing any existing value. */
  setItem(key: string, value: string): Promise<void>;

  /** Read the value stored under `key`, or `null` when the key is absent. */
  getItem(key: string): Promise<string | null>;

  /** Remove the key; a no-op when absent. */
  removeItem(key: string): Promise<void>;

  /** Whether a value is stored under `key`. */
  hasItem(key: string): Promise<boolean>;

  /**
   * All stored keys, optionally narrowed to keys starting with `prefix`.
   * Used for enumerating saved projects and for cache eviction.
   */
  keys(prefix?: string): Promise<string[]>;
}
