interface CacheEntry {
  data: unknown;
  timestamp: number;
  expiry: number;
  lastAccessed: number;
}

export interface MovieCacheOptions {
  /** Maximum number of entries; LRU evicts when exceeded after TTL cleanup. Default 500. */
  maxEntries?: number;
}

export class MovieCache {
  private readonly maxEntries: number;
  private cache = new Map<string, CacheEntry>();

  constructor(options: MovieCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
  }

  set<T>(key: string, data: T, ttlMinutes: number = 60): void {
    this.cleanupExpired();
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiry: now + ttlMinutes * 60 * 1000,
      lastAccessed: now,
    });
    this.evictLruWhileOverCapacity();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    entry.lastAccessed = Date.now();
    return entry.data as T;
  }

  clear(): void {
    this.cache.clear();
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  private evictLruWhileOverCapacity(): void {
    while (this.cache.size > this.maxEntries) {
      let lruKey: string | null = null;
      let oldestAccess = Infinity;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessed < oldestAccess) {
          oldestAccess = entry.lastAccessed;
          lruKey = key;
        }
      }
      if (lruKey === null) {
        break;
      }
      this.cache.delete(lruKey);
    }
  }
}
