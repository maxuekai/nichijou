import type { TavilySearchParams, TavilySearchResponse, SearchResult, WebSearchConfig } from "../types.js";

const TAVILY_API_URL = "https://api.tavily.com/search";

/**
 * 解析API密钥
 */
function resolveApiKey(config: WebSearchConfig): string {
  // 优先使用配置中的密钥，其次使用环境变量
  const apiKey = config.tavilyApiKey || process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    throw new Error("Tavily API密钥未配置。请在插件配置中设置tavilyApiKey，或设置环境变量TAVILY_API_KEY");
  }

  return apiKey;
}

/**
 * 转换Tavily结果到统一格式
 */
function convertTavilyResults(response: TavilySearchResponse): SearchResult[] {
  return response.results.map(result => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
    score: result.score,
  }));
}

/**
 * 使用Tavily API搜索
 */
export async function searchWithTavily(
  query: string,
  maxResults: number = 5,
  config: WebSearchConfig = {}
): Promise<SearchResult[]> {
  const apiKey = resolveApiKey(config);
  const timeout = config.timeout || 10000;

  // 构建请求参数
  const params: TavilySearchParams = {
    query,
    search_depth: "basic",
    include_answer: false, // 我们只需要搜索结果，不需要AI生成的答案
    max_results: Math.min(maxResults, 20), // Tavily限制最多20个结果
    country: "china", // 倾向中文结果
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 处理不同的错误状态
      if (response.status === 401) {
        throw new Error("Tavily API密钥无效或已过期");
      } else if (response.status === 429) {
        throw new Error("Tavily API配额已达上限，请稍后重试");
      } else if (response.status === 400) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Tavily API请求参数错误: ${errorText}`);
      } else {
        throw new Error(`Tavily API请求失败 (${response.status}): ${response.statusText}`);
      }
    }

    const data = await response.json() as TavilySearchResponse;

    // 验证响应数据
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Tavily API返回数据格式异常");
    }

    const results = convertTavilyResults(data);
    
    if (results.length === 0) {
      console.log(`[Tavily] 查询 "${query}" 没有找到结果`);
    } else {
      console.log(`[Tavily] 查询 "${query}" 找到 ${results.length} 个结果`);
    }

    return results;

  } catch (error) {
    // 区分网络错误和API错误
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(`Tavily搜索超时 (${timeout}ms)`);
      } else if (error.message.includes("Failed to fetch") || error.message.includes("network")) {
        throw new Error("Tavily网络连接失败，请检查网络连接");
      } else {
        // 重新抛出已处理的错误
        throw error;
      }
    } else {
      throw new Error(`Tavily搜索时发生未知错误: ${String(error)}`);
    }
  }
}

/**
 * 检查Tavily API密钥是否配置
 */
export function isTavilyConfigured(config: WebSearchConfig = {}): boolean {
  return !!(config.tavilyApiKey || process.env.TAVILY_API_KEY);
}

/**
 * 验证Tavily API密钥有效性
 */
export async function validateTavilyApiKey(config: WebSearchConfig = {}): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const apiKey = resolveApiKey(config);
    
    // 发送一个简单的测试查询
    const response = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: "test",
        max_results: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { valid: true };
    } else if (response.status === 401) {
      return { valid: false, error: "API密钥无效" };
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