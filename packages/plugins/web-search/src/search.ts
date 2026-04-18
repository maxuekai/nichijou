import type { SearchParams, SearchResult, SearchEngine, WebSearchConfig } from "./types.js";
import { searchWithTavily, isTavilyConfigured } from "./search-engines/tavily.js";
import { searchWithBing, isBingConfigured } from "./search-engines/bing.js";
import { 
  getCachedSearchResults, 
  cacheSearchResults, 
  getStaleSearchResults 
} from "./cache.js";

/**
 * 确定实际使用的搜索引擎
 */
function resolveSearchEngine(
  requestedEngine: SearchEngine | undefined,
  config: WebSearchConfig
): SearchEngine {
  // 如果明确指定引擎，则使用指定的
  if (requestedEngine && requestedEngine !== "auto") {
    return requestedEngine;
  }

  // 否则根据配置的defaultEngine或自动选择
  const defaultEngine = config.defaultEngine || "auto";
  
  if (defaultEngine === "auto") {
    // 自动选择：优先Tavily，备选Bing
    if (isTavilyConfigured(config)) {
      return "tavily";
    } else if (isBingConfigured(config)) {
      return "bing";
    } else {
      throw new Error("没有配置可用的搜索引擎API密钥。请配置Tavily或Bing API密钥。");
    }
  }

  return defaultEngine;
}

/**
 * 使用指定引擎搜索
 */
async function searchWithEngine(
  engine: SearchEngine,
  query: string,
  maxResults: number,
  config: WebSearchConfig
): Promise<SearchResult[]> {
  switch (engine) {
    case "tavily":
      if (!isTavilyConfigured(config)) {
        throw new Error("Tavily API密钥未配置");
      }
      return await searchWithTavily(query, maxResults, config);

    case "bing":
      if (!isBingConfigured(config)) {
        throw new Error("Bing API密钥未配置");
      }
      return await searchWithBing(query, maxResults, config);

    default:
      throw new Error(`不支持的搜索引擎: ${engine}`);
  }
}

/**
 * 主搜索函数，支持引擎切换和缓存
 */
export async function performSearch(
  params: SearchParams,
  config: WebSearchConfig
): Promise<{
  results: SearchResult[];
  engine: SearchEngine;
  fromCache: boolean;
  warnings?: string[];
}> {
  const { query, maxResults = 5, engine: requestedEngine } = params;
  const enableCache = config.enableCache !== false;
  const cacheMinutes = config.cacheMinutes || 30;
  const warnings: string[] = [];

  // 输入验证
  if (!query || query.trim().length === 0) {
    throw new Error("搜索查询不能为空");
  }

  if (maxResults < 1 || maxResults > 50) {
    throw new Error("搜索结果数量必须在1-50之间");
  }

  const trimmedQuery = query.trim();
  let selectedEngine: SearchEngine;
  
  try {
    selectedEngine = resolveSearchEngine(requestedEngine, config);
  } catch (error) {
    throw new Error(`引擎选择失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 尝试从缓存获取结果
  const cachedResults = getCachedSearchResults(trimmedQuery, selectedEngine, maxResults, enableCache);
  if (cachedResults) {
    return {
      results: cachedResults,
      engine: selectedEngine,
      fromCache: true,
    };
  }

  // 主引擎搜索
  let results: SearchResult[] = [];
  let usedEngine = selectedEngine;
  let searchError: Error | null = null;

  try {
    results = await searchWithEngine(selectedEngine, trimmedQuery, maxResults, config);
    
    // 缓存成功的结果
    if (results.length > 0) {
      cacheSearchResults(trimmedQuery, selectedEngine, maxResults, results, cacheMinutes, enableCache);
    }

  } catch (error) {
    searchError = error instanceof Error ? error : new Error(String(error));
    console.warn(`[WebSearch] ${selectedEngine} 搜索失败:`, searchError.message);

    // 尝试备用引擎
    const fallbackEngine = selectedEngine === "tavily" ? "bing" : "tavily";
    
    if (fallbackEngine !== selectedEngine) {
      try {
        // 检查备用引擎是否可用
        const isFallbackAvailable = fallbackEngine === "tavily" 
          ? isTavilyConfigured(config)
          : isBingConfigured(config);

        if (isFallbackAvailable) {
          console.log(`[WebSearch] 尝试使用备用引擎: ${fallbackEngine}`);
          results = await searchWithEngine(fallbackEngine, trimmedQuery, maxResults, config);
          usedEngine = fallbackEngine;
          warnings.push(`主搜索引擎${selectedEngine}失败，已切换到${fallbackEngine}`);

          // 缓存备用引擎的结果
          if (results.length > 0) {
            cacheSearchResults(trimmedQuery, fallbackEngine, maxResults, results, cacheMinutes, enableCache);
          }

        } else {
          console.warn(`[WebSearch] 备用引擎 ${fallbackEngine} 未配置，无法切换`);
        }
      } catch (fallbackError) {
        console.warn(`[WebSearch] 备用引擎 ${fallbackEngine} 也失败:`, fallbackError);
        // 继续尝试缓存降级
      }
    }

    // 如果所有引擎都失败，尝试从过期缓存获取结果
    if (results.length === 0) {
      const staleResults = getStaleSearchResults(trimmedQuery, selectedEngine, maxResults);
      if (staleResults && staleResults.length > 0) {
        results = staleResults;
        warnings.push("所有搜索引擎暂时不可用，返回缓存结果");
        console.log(`[WebSearch] 使用过期缓存结果: ${staleResults.length} 个`);
      } else {
        // 完全失败，抛出错误
        throw new Error(`搜索失败: ${searchError.message}`);
      }
    }
  }

  return {
    results,
    engine: usedEngine,
    fromCache: false,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * 获取可用的搜索引擎列表
 */
export function getAvailableEngines(config: WebSearchConfig): {
  engine: SearchEngine;
  configured: boolean;
  name: string;
}[] {
  return [
    {
      engine: "tavily",
      configured: isTavilyConfigured(config),
      name: "Tavily (AI优化)",
    },
    {
      engine: "bing",
      configured: isBingConfigured(config),
      name: "Bing (微软官方)",
    },
  ];
}

/**
 * 格式化搜索结果为文本
 */
export function formatSearchResults(
  results: SearchResult[],
  engine: SearchEngine,
  fromCache: boolean,
  warnings?: string[]
): string {
  if (results.length === 0) {
    return "未找到相关搜索结果。";
  }

  let output = `🔍 搜索结果 (${engine}${fromCache ? ", 来自缓存" : ""})\n\n`;

  // 添加警告信息
  if (warnings && warnings.length > 0) {
    output += `⚠️ ${warnings.join("; ")}\n\n`;
  }

  // 格式化每个结果
  results.forEach((result, index) => {
    output += `${index + 1}. **${result.title}**\n`;
    output += `   ${result.url}\n`;
    output += `   ${result.snippet}\n`;
    if (result.score) {
      output += `   (相关度: ${result.score.toFixed(2)})\n`;
    }
    output += `\n`;
  });

  output += `📊 共找到 ${results.length} 个结果`;

  return output;
}