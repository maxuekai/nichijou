// 搜索引擎类型
export type SearchEngine = "tavily" | "bing" | "auto";

// 搜索参数接口
export interface SearchParams {
  query: string;
  maxResults?: number;
  engine?: SearchEngine;
}

// 搜索结果接口
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

// Tavily API 参数
export interface TavilySearchParams {
  query: string;
  search_depth?: "basic" | "advanced";
  include_answer?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
  max_results?: number;
  include_images?: boolean;
  include_raw_content?: boolean;
  country?: string;
}

// Tavily API 响应
export interface TavilySearchResponse {
  query: string;
  follow_up_questions: string[] | null;
  answer: string | null;
  images: string[] | null;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    raw_content?: string;
  }>;
  response_time: number;
}

// Bing API 参数
export interface BingSearchParams {
  q: string;
  count?: number;
  offset?: number;
  mkt?: string;
  safeSearch?: "Off" | "Moderate" | "Strict";
}

// Bing API 响应
export interface BingSearchResponse {
  _type: string;
  webPages?: {
    webSearchUrl: string;
    totalEstimatedMatches: number;
    value: Array<{
      id: string;
      name: string;
      url: string;
      displayUrl: string;
      snippet: string;
      dateLastCrawled: string;
    }>;
  };
}

// 缓存条目接口
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expireAfter: number;
}

// 插件配置接口
export interface WebSearchConfig {
  tavilyApiKey?: string;
  bingApiKey?: string;
  defaultEngine?: SearchEngine;
  maxResults?: number;
  enableCache?: boolean;
  cacheMinutes?: number;
  timeout?: number;
}