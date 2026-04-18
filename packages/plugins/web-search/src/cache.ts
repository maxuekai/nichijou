import type { CacheEntry, SearchResult } from "./types.js";

// 搜索结果缓存存储
const searchCache = new Map<string, CacheEntry<SearchResult[]>>();

/**
 * 生成缓存键
 */
function generateCacheKey(query: string, engine: string, maxResults: number): string {
  return JSON.stringify({ query: query.toLowerCase().trim(), engine, maxResults });
}

/**
 * 获取缓存的搜索结果
 */
export function getCachedSearchResults(
  query: string,
  engine: string,
  maxResults: number,
  enableCache: boolean = true
): SearchResult[] | null {
  if (!enableCache) {
    return null;
  }

  const cacheKey = generateCacheKey(query, engine, maxResults);
  const cached = searchCache.get(cacheKey);

  if (cached) {
    const now = Date.now();
    if (now - cached.timestamp < cached.expireAfter) {
      return cached.data;
    } else {
      // 缓存过期，删除
      searchCache.delete(cacheKey);
    }
  }

  return null;
}

/**
 * 缓存搜索结果
 */
export function cacheSearchResults(
  query: string,
  engine: string,
  maxResults: number,
  results: SearchResult[],
  cacheMinutes: number = 30,
  enableCache: boolean = true
): void {
  if (!enableCache || results.length === 0) {
    return;
  }

  const cacheKey = generateCacheKey(query, engine, maxResults);
  const expireAfter = cacheMinutes * 60 * 1000; // 转换为毫秒

  searchCache.set(cacheKey, {
    data: results,
    timestamp: Date.now(),
    expireAfter,
  });
}

/**
 * 获取过期的缓存结果作为降级方案
 */
export function getStaleSearchResults(
  query: string,
  engine: string,
  maxResults: number
): SearchResult[] | null {
  const cacheKey = generateCacheKey(query, engine, maxResults);
  const cached = searchCache.get(cacheKey);

  if (cached) {
    return cached.data;
  }

  return null;
}

/**
 * 清理过期缓存
 */
export function cleanExpiredSearchCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of searchCache.entries()) {
    if (now - entry.timestamp >= entry.expireAfter) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    searchCache.delete(key);
  }

  if (keysToDelete.length > 0) {
    console.log(`[WebSearch] 清理了 ${keysToDelete.length} 个过期缓存项`);
  }
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): {
  totalEntries: number;
  memoryUsage: string;
} {
  const totalEntries = searchCache.size;
  
  // 估算内存使用
  let estimatedSize = 0;
  for (const [key, entry] of searchCache.entries()) {
    estimatedSize += key.length * 2; // 字符串大小估算
    estimatedSize += JSON.stringify(entry.data).length * 2;
    estimatedSize += 32; // 对象开销估算
  }

  const memoryUsage = estimatedSize > 1024 * 1024 
    ? `${(estimatedSize / 1024 / 1024).toFixed(2)} MB`
    : `${(estimatedSize / 1024).toFixed(2)} KB`;

  return {
    totalEntries,
    memoryUsage,
  };
}