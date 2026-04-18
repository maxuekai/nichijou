import { definePlugin } from "@nichijou/plugin-sdk";
import type { NewsFetchParams, GitHubProjectsParams } from "./types.js";
import { fetchNews, cleanExpiredCache } from "./news-api.js";
import { fetchGitHubProjects, cleanExpiredGitHubCache } from "./github-api.js";

// 定期清理过期缓存（每10分钟执行一次）
setInterval(() => {
  try {
    cleanExpiredCache();
    cleanExpiredGitHubCache();
  } catch (error) {
    // 静默处理缓存清理错误，避免影响主功能
    console.warn("新闻插件缓存清理失败:", error);
  }
}, 10 * 60 * 1000);

// fetchNewsDetail 函数已删除 - 不再提供新闻详情功能

export default definePlugin({
  id: "news",
  name: "新闻助手",
  description: "获取最新中文新闻和 GitHub 热门 AI 项目信息，基于稳定的RSS源",
  version: "0.1.0",

  configSchema: {
    githubHotness: {
      type: "string",
      description: "GitHub 项目热度策略：active(活跃)、new(新项目)、popular(热门)",
      default: "active",
      required: false,
    },
    githubMinStars: {
      type: "number",
      description: "GitHub 项目最小 star 数",
      default: 50,
      required: false,
    },
    enableCache: {
      type: "boolean",
      description: "启用缓存减少网络请求",
      default: true,
      required: false,
    },
    newsCacheMinutes: {
      type: "number",
      description: "新闻缓存时间（分钟）",
      default: 15,
      required: false,
    },
    githubCacheMinutes: {
      type: "number",
      description: "GitHub 缓存时间（分钟）",
      default: 30,
      required: false,
    },
  },

  tools: [
    {
      name: "news_fetch",
      description:
        "获取最新中文新闻摘要。基于稳定的RSS新闻源（IT之家、36氪、少数派、网易新闻），" +
        "完全免费，返回格式化的新闻内容。",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "返回新闻数量，默认 5",
            minimum: 1,
            maximum: 20,
          },
        },
        required: [],
      },
      execute: async (params) => {
        try {
          // 这里的 params 已经包含了插件配置和调用参数的合并结果
          return await fetchNews(params as NewsFetchParams, params);
        } catch (err) {
          return {
            content: `新闻获取失败: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },
    {
      name: "github_ai_projects",
      description:
        "获取 GitHub 上热门的 AI/机器学习项目。支持按热度策略（active/new/popular）、" +
        "编程语言、最小 star 数等条件筛选。",
      parameters: {
        type: "object",
        properties: {
          hotness: {
            type: "string",
            enum: ["active", "new", "popular"],
            description: "热度策略：active(近期活跃+高star)、new(最近创建)、popular(纯star排序)",
          },
          language: {
            type: "string",
            enum: ["python", "javascript", "typescript", "all"],
            description: "编程语言筛选",
          },
          minStars: {
            type: "number",
            description: "最小 star 数",
            minimum: 0,
          },
          recentDays: {
            type: "number",
            description: "用于 active 和 new 策略的近期天数",
            minimum: 1,
            maximum: 365,
          },
          limit: {
            type: "number",
            description: "返回项目数量，默认 5",
            minimum: 1,
            maximum: 20,
          },
        },
        required: [],
      },
      execute: async (params) => {
        try {
          // 这里的 params 已经包含了插件配置和调用参数的合并结果
          return await fetchGitHubProjects(params as GitHubProjectsParams, params);
        } catch (err) {
          return {
            content: `GitHub 项目获取失败: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },
  ],

  dashboardWidgets: [
    { id: "github-trending", name: "GitHub 热门", component: "GitHubTrending", defaultSize: "small" },
  ],
});