import { definePlugin } from "@nichijou/plugin-sdk";
import type { SearchParams, WebSearchConfig } from "./types.js";
import { performSearch, getAvailableEngines, formatSearchResults } from "./search.js";
import { cleanExpiredSearchCache, getCacheStats } from "./cache.js";
import { validateTavilyApiKey } from "./search-engines/tavily.js";
import { validateBingApiKey } from "./search-engines/bing.js";

// 定期清理过期缓存（每10分钟执行一次）
setInterval(() => {
  try {
    cleanExpiredSearchCache();
  } catch (error) {
    console.warn("[WebSearch] 缓存清理失败:", error);
  }
}, 10 * 60 * 1000);

export default definePlugin({
  id: "web-search",
  name: "网络搜索",
  description: "在互联网上搜索最新信息，支持Tavily和Bing双引擎自动切换，提供智能缓存和结果优化",
  version: "0.1.0",

  configSchema: {
    tavilyApiKey: {
      type: "string",
      description: "Tavily搜索API密钥 (推荐，AI优化结果)",
      required: false,
    },
    bingApiKey: {
      type: "string", 
      description: "Bing搜索API密钥 (备用，中文支持好)",
      required: false,
    },
    defaultEngine: {
      type: "string",
      description: "默认搜索引擎",
      default: "auto",
      required: false,
    },
    maxResults: {
      type: "number",
      description: "默认搜索结果数量 (1-20)",
      default: 5,
      required: false,
    },
    enableCache: {
      type: "boolean",
      description: "启用搜索结果缓存",
      default: true,
      required: false,
    },
    cacheMinutes: {
      type: "number",
      description: "缓存有效期（分钟，1-1440）",
      default: 30,
      required: false,
    },
    timeout: {
      type: "number",
      description: "搜索超时时间（毫秒，3000-30000）",
      default: 10000,
      required: false,
    },
  },

  tools: [
    {
      name: "web_search",
      description: "在互联网上搜索最新信息。支持Tavily和Bing双引擎，自动切换确保搜索成功率。返回标题、链接和摘要。适合回答需要最新信息的问题，如新闻、天气、股价、技术资讯等。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词或问题，支持中英文",
          },
          maxResults: {
            type: "number", 
            description: "返回结果数量，默认5个",
            minimum: 1,
            maximum: 20,
          },
          engine: {
            type: "string",
            enum: ["tavily", "bing", "auto"],
            description: "指定搜索引擎：tavily(AI优化)、bing(官方稳定)、auto(自动选择)",
          },
        },
        required: ["query"],
      },
      execute: async (params: any) => {
        try {
          // params 包含了插件配置和调用参数的合并结果
          const config = params as WebSearchConfig;
          const searchParams: SearchParams = {
            query: params.query as string,
            maxResults: params.maxResults as number,
            engine: params.engine as any,
          };

          // 执行搜索
          const searchResult = await performSearch(searchParams, config);

          // 格式化结果
          const formattedResult = formatSearchResults(
            searchResult.results,
            searchResult.engine,
            searchResult.fromCache,
            searchResult.warnings
          );

          return {
            content: formattedResult,
            isError: false,
          };

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // 对于某些错误，返回友好提示而不是标记为错误
          if (errorMessage.includes("API密钥未配置") || 
              errorMessage.includes("没有配置可用的搜索引擎")) {
            return {
              content: `🔧 搜索功能需要配置\n\n${errorMessage}\n\n请在管理页面的插件设置中配置Tavily或Bing API密钥。\n\n📖 获取API密钥:\n• Tavily: https://tavily.com (免费1000次/月)\n• Bing: https://azure.microsoft.com (免费1000次/月)`,
              isError: false, // 配置问题不算错误，避免LLM过度反应
            };
          }

          return {
            content: `网络搜索失败: ${errorMessage}`,
            isError: true,
          };
        }
      },
    },

    {
      name: "search_engine_status",
      description: "检查搜索引擎配置状态和缓存统计信息",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async (params: any) => {
        try {
          const config = params as WebSearchConfig;
          const engines = getAvailableEngines(config);
          const cacheStats = getCacheStats();

          let statusText = "🔍 搜索引擎状态\n\n";

          // 引擎状态
          for (const engine of engines) {
            const status = engine.configured ? "✅ 已配置" : "❌ 未配置";
            statusText += `• ${engine.name}: ${status}\n`;
          }

          // 缓存统计
          statusText += `\n📊 缓存统计\n`;
          statusText += `• 缓存条目: ${cacheStats.totalEntries}\n`;
          statusText += `• 内存占用: ${cacheStats.memoryUsage}\n`;

          // 配置建议
          const configuredCount = engines.filter(e => e.configured).length;
          if (configuredCount === 0) {
            statusText += `\n⚠️ 未配置任何搜索引擎，功能无法使用`;
          } else if (configuredCount === 1) {
            statusText += `\n💡 建议配置两个引擎以确保服务可用性`;
          } else {
            statusText += `\n✨ 配置完整，支持引擎自动切换`;
          }

          return {
            content: statusText,
            isError: false,
          };

        } catch (error) {
          return {
            content: `获取状态失败: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
      },
    },

    {
      name: "validate_search_keys",
      description: "验证搜索API密钥的有效性",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async (params: any) => {
        try {
          const config = params as WebSearchConfig;
          let validationText = "🔑 API密钥验证\n\n";

          // 验证Tavily
          if (config.tavilyApiKey || process.env.TAVILY_API_KEY) {
            const tavilyResult = await validateTavilyApiKey(config);
            const status = tavilyResult.valid ? "✅ 有效" : "❌ 无效";
            validationText += `• Tavily: ${status}`;
            if (!tavilyResult.valid && tavilyResult.error) {
              validationText += ` (${tavilyResult.error})`;
            }
            validationText += `\n`;
          } else {
            validationText += `• Tavily: ⚠️ 未配置\n`;
          }

          // 验证Bing
          if (config.bingApiKey || process.env.BING_API_KEY) {
            const bingResult = await validateBingApiKey(config);
            const status = bingResult.valid ? "✅ 有效" : "❌ 无效";
            validationText += `• Bing: ${status}`;
            if (!bingResult.valid && bingResult.error) {
              validationText += ` (${bingResult.error})`;
            }
            validationText += `\n`;
          } else {
            validationText += `• Bing: ⚠️ 未配置\n`;
          }

          return {
            content: validationText,
            isError: false,
          };

        } catch (error) {
          return {
            content: `验证失败: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
      },
    },
  ],

  // 暂时不需要Dashboard widgets
  dashboardWidgets: [],
});