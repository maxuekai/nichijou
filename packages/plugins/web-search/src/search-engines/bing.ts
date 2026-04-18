import type { BingSearchParams, BingSearchResponse, SearchResult, WebSearchConfig } from "../types.js";

const BING_API_URL = "https://api.bing.microsoft.com/v7.0/search";

/**
 * 解析API密钥
 */
function resolveApiKey(config: WebSearchConfig): string {
  // 优先使用配置中的密钥，其次使用环境变量
  const apiKey = config.bingApiKey || process.env.BING_API_KEY;
  
  if (!apiKey) {
    throw new Error("Bing API密钥未配置。请在插件配置中设置bingApiKey，或设置环境变量BING_API_KEY");
  }

  return apiKey;
}

/**
 * 转换Bing结果到统一格式
 */
function convertBingResults(response: BingSearchResponse): SearchResult[] {
  if (!response.webPages?.value) {
    return [];
  }

  return response.webPages.value.map(result => ({
    title: result.name,
    url: result.url,
    snippet: result.snippet,
    score: undefined, // Bing不提供评分
  }));
}

/**
 * 使用Bing API搜索
 */
export async function searchWithBing(
  query: string,
  maxResults: number = 5,
  config: WebSearchConfig = {}
): Promise<SearchResult[]> {
  const apiKey = resolveApiKey(config);
  const timeout = config.timeout || 10000;

  // 构建查询参数
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("count", Math.min(maxResults, 50).toString()); // Bing限制最多50个结果
  params.set("mkt", "zh-CN"); // 中文市场偏好
  params.set("safeSearch", "Moderate"); // 中等安全搜索
  params.set("textDecorations", "false"); // 不需要文本装饰
  params.set("textFormat", "Raw"); // 原始文本格式

  const url = `${BING_API_URL}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "User-Agent": "NichijouLoop/1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 处理不同的错误状态
      if (response.status === 401) {
        throw new Error("Bing API密钥无效或已过期");
      } else if (response.status === 429) {
        throw new Error("Bing API请求过于频繁，请稍后重试");
      } else if (response.status === 403) {
        throw new Error("Bing API访问被拒绝，请检查API密钥权限");
      } else if (response.status === 400) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Bing API请求参数错误: ${errorText}`);
      } else {
        throw new Error(`Bing API请求失败 (${response.status}): ${response.statusText}`);
      }
    }

    const data = await response.json() as BingSearchResponse;

    // 验证响应数据
    if (!data.webPages) {
      console.log(`[Bing] 查询 "${query}" 没有找到网页结果`);
      return [];
    }

    const results = convertBingResults(data);
    
    if (results.length === 0) {
      console.log(`[Bing] 查询 "${query}" 没有找到结果`);
    } else {
      console.log(`[Bing] 查询 "${query}" 找到 ${results.length} 个结果`);
    }

    return results;

  } catch (error) {
    // 区分网络错误和API错误
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(`Bing搜索超时 (${timeout}ms)`);
      } else if (error.message.includes("Failed to fetch") || error.message.includes("network")) {
        throw new Error("Bing网络连接失败，请检查网络连接");
      } else {
        // 重新抛出已处理的错误
        throw error;
      }
    } else {
      throw new Error(`Bing搜索时发生未知错误: ${String(error)}`);
    }
  }
}

/**
 * 检查Bing API密钥是否配置
 */
export function isBingConfigured(config: WebSearchConfig = {}): boolean {
  return !!(config.bingApiKey || process.env.BING_API_KEY);
}

/**
 * 验证Bing API密钥有效性
 */
export async function validateBingApiKey(config: WebSearchConfig = {}): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const apiKey = resolveApiKey(config);
    
    // 发送一个简单的测试查询
    const testUrl = `${BING_API_URL}?q=test&count=1`;
    
    const response = await fetch(testUrl, {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "User-Agent": "NichijouLoop/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { valid: true };
    } else if (response.status === 401) {
      return { valid: false, error: "API密钥无效" };
    } else if (response.status === 403) {
      return { valid: false, error: "API密钥权限不足" };
    } else if (response.status === 429) {
      // 配额达到上限但密钥有效
      return { valid: true };
    } else {
      return { valid: false, error: `HTTP ${response.status}` };
    }

  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}