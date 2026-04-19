import { MovieCache } from "./utils/cache.js";
import type { Movie, MovieSearchParams } from "./types.js";

const FETCH_TIMEOUT_MS = 8000;
const MAX_FETCH_ATTEMPTS = 4;

/** 与插件配置对齐：控制搜索结果的内存缓存（与下载无关）。 */
export interface SearchMoviesCacheOptions {
  /** 默认 true；为 false 时跳过读/写缓存 */
  enabled?: boolean;
  /** 缓存有效期（分钟），建议由插件配置的 cacheDurationMinutes 传入 */
  ttlMinutes?: number;
}

export class DoubanAPI {
  private cache = new MovieCache();
  private readonly baseUrl = "https://frodo.douban.com/api/v2";

  async searchMovies(params: MovieSearchParams, cacheOptions?: SearchMoviesCacheOptions): Promise<Movie[]> {
    const useCache = cacheOptions?.enabled !== false;
    const ttlRaw = cacheOptions?.ttlMinutes ?? 30;
    const ttlMinutes = Math.min(Math.max(Number.isFinite(ttlRaw) ? ttlRaw : 30, 1), 24 * 60);

    const cacheKey = `search:${JSON.stringify(params)}`;
    if (useCache) {
      const cached = this.cache.get<Movie[]>(cacheKey);
      if (cached) return cached;
    }

    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

    try {
      const url = `${this.baseUrl}/search/movie?q=${encodeURIComponent(params.query)}&count=${limit}`;
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(`豆瓣 API 请求失败（HTTP ${response.status}）`);
      }

      const data = (await response.json()) as any;
      let movies = this.transformMovies(data.subjects || []);

      if (params.year !== undefined) {
        movies = movies.filter((m) => m.year === params.year);
      }
      if (params.genre) {
        const g = params.genre.trim();
        if (g) {
          movies = movies.filter((m) => m.genres.some((x) => x.includes(g)));
        }
      }

      if (useCache) {
        this.cache.set(cacheKey, movies, ttlMinutes);
      }
      return movies;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail);
    }
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "api-client" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (response.ok) {
          return response;
        }

        if (this.shouldRetryResponse(response.status) && attempt < MAX_FETCH_ATTEMPTS - 1) {
          await this.delay(this.backoffMs(attempt));
          continue;
        }

        return response;
      } catch (error) {
        if (this.isRetryableFetchError(error) && attempt < MAX_FETCH_ATTEMPTS - 1) {
          await this.delay(this.backoffMs(attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error("豆瓣API请求失败: 重试用尽");
  }

  private shouldRetryResponse(status: number): boolean {
    return status >= 500 || status === 429;
  }

  private isRetryableFetchError(error: unknown): boolean {
    if (error instanceof TypeError) {
      return true;
    }
    if (error instanceof Error) {
      const name = (error as DOMException).name;
      return name === "AbortError" || name === "TimeoutError";
    }
    return false;
  }

  private backoffMs(attempt: number): number {
    return Math.min(250 * 2 ** attempt, 4000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private transformMovie(data: any): Movie {
    return {
      id: String(data.id || ""),
      title: data.title,
      originalTitle: data.original_title,
      year: parseInt(data.year) || 0,
      rating: data.rating?.average || 0,
      genres:
        data.genres?.map((g: any) => (typeof g === "string" ? g : g?.name)).filter(Boolean) || [],
      directors: data.directors?.map((d: any) => d.name) || [],
      actors: data.casts?.slice(0, 5).map((a: any) => a.name) || [],
      poster: data.pic?.large || data.cover || "",
      summary: data.summary || "",
      doubanUrl: data.alt || `https://movie.douban.com/subject/${data.id}/`,
    };
  }

  private transformMovies(subjects: any[]): Movie[] {
    return subjects.map((subject) => this.transformMovie(subject));
  }
}
