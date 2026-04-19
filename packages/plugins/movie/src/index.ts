import { definePlugin } from "@nichijou/plugin-sdk";
import { DoubanAPI } from "./douban-api.js";
import type { MovieSearchParams } from "./types.js";

const douban = new DoubanAPI();

/** 用户可见错误行统一前缀（与占位说明区分） */
const PLUGIN_ERR_PREFIX = "电影插件：";

function pluginError(detail: string): { content: string; isError: true } {
  return { content: `${PLUGIN_ERR_PREFIX}${detail}`, isError: true };
}

type IntRead = { kind: "absent" } | { kind: "ok"; n: number } | { kind: "bad" };

function readOptionalInt(value: unknown): IntRead {
  if (value === undefined || value === null) return { kind: "absent" };
  if (typeof value === "string" && value.trim() === "") return { kind: "absent" };

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { kind: "bad" };
    return { kind: "ok", n: Math.trunc(value) };
  }

  if (typeof value === "string") {
    const t = value.trim();
    const n = parseInt(t, 10);
    if (Number.isNaN(n)) return { kind: "bad" };
    return { kind: "ok", n };
  }

  return { kind: "bad" };
}

function readEnableCache(value: unknown): boolean {
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return true;
}

function notImplemented(feature: string): { content: string; isError?: boolean } {
  return {
    content:
      `「${feature}」功能开发中，敬请期待。` +
      "当前仅已接入：电影搜索（movie_search）。",
    isError: false,
  };
}

function jsonContent(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default definePlugin({
  id: "movie",
  name: "电影助手",
  description: "豆瓣电影关键词搜索；推荐、详情、下载与本地库将在后续版本接入。",
  version: "0.1.0",

  configSchema: {
    downloadPath: {
      type: "string",
      description: "电影下载目录路径（下载功能启用后使用；默认 ./downloads/movies）",
      required: false,
      default: "./downloads/movies",
    },
    qbittorrentUrl: {
      type: "string",
      description: "qBittorrent Web UI 地址（下载功能启用后使用；默认 http://localhost:8080）",
      required: false,
      default: "http://localhost:8080",
    },
    qbittorrentUsername: {
      type: "string",
      description: "qBittorrent 用户名（下载功能启用后填写）",
      required: false,
    },
    qbittorrentPassword: {
      type: "string",
      description: "qBittorrent 密码（下载功能启用后填写）",
      required: false,
    },
    maxConcurrentDownloads: {
      type: "number",
      description: "同时下载任务数上限",
      default: 3,
      required: false,
    },
    maxFileSizeGB: {
      type: "number",
      description: "单个文件最大大小（GB）",
      default: 20,
      required: false,
    },
    minFileSizeMB: {
      type: "number",
      description: "单个文件最小大小（MB）",
      default: 100,
      required: false,
    },
    enableCache: {
      type: "boolean",
      description: "是否启用豆瓣数据缓存",
      default: true,
      required: false,
    },
    cacheDurationMinutes: {
      type: "number",
      description: "缓存有效期（分钟）",
      default: 60,
      required: false,
    },
  },

  tools: [
    {
      name: "movie_search",
      description: "根据关键词搜索电影，返回匹配的电影列表（豆瓣评分、年份、类型等）。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词（片名或原名片段）" },
          limit: { type: "number", description: "返回条数，默认 10，最大 50", minimum: 1, maximum: 50 },
          year: { type: "number", description: "按上映年份进一步筛选" },
          genre: { type: "string", description: "按类型关键词筛选（与片方类型标签做包含匹配）" },
        },
        required: ["query"],
      },
      execute: async (params) => {
        try {
          const query = typeof params.query === "string" ? params.query.trim() : "";
          if (!query) {
            return pluginError("参数错误：query 不能为空");
          }

          const limitRead = readOptionalInt(params.limit);
          if (limitRead.kind === "bad") {
            return pluginError("参数错误：limit 必须是 1–50 之间的数字");
          }
          if (limitRead.kind === "ok" && (limitRead.n < 1 || limitRead.n > 50)) {
            return pluginError("参数错误：limit 必须是 1–50 之间的数字");
          }

          const yearRead = readOptionalInt(params.year);
          if (yearRead.kind === "bad") {
            return pluginError("参数错误：year 须为整数或数字字符串（例如 2019）");
          }
          if (yearRead.kind === "ok" && (yearRead.n < 1888 || yearRead.n > 2100)) {
            return pluginError("参数错误：year 须在 1888–2100 之间");
          }

          const ttlRead = readOptionalInt(params.cacheDurationMinutes);
          if (ttlRead.kind === "bad") {
            return pluginError("参数错误：cacheDurationMinutes 须为 1–1440 之间的整数或数字字符串");
          }
          let cacheTtlMinutes = 60;
          if (ttlRead.kind === "ok") {
            if (ttlRead.n < 1 || ttlRead.n > 1440) {
              return pluginError("参数错误：cacheDurationMinutes 须在 1–1440 之间");
            }
            cacheTtlMinutes = ttlRead.n;
          }

          const useCache = readEnableCache(params.enableCache);

          const searchParams: MovieSearchParams = {
            query,
            limit: limitRead.kind === "ok" ? limitRead.n : undefined,
            year: yearRead.kind === "ok" ? yearRead.n : undefined,
            genre: typeof params.genre === "string" ? params.genre : undefined,
          };

          const movies = await douban.searchMovies(searchParams, {
            enabled: useCache,
            ttlMinutes: cacheTtlMinutes,
          });
          return { content: jsonContent({ ok: true, count: movies.length, movies }) };
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          return pluginError(`搜索失败：${detail}`);
        }
      },
    },
    {
      name: "movie_recommend",
      description:
        "基于豆瓣评分与热度推荐电影（功能开发中）。参数预留：类别 hot / top_rated / latest、类型、数量与最低分。",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "推荐类别：hot、top_rated、latest",
            enum: ["hot", "top_rated", "latest"],
          },
          genre: { type: "string", description: "电影类型标签（如动作、喜剧）" },
          limit: { type: "number", description: "推荐数量，默认 5，最大 50", minimum: 1, maximum: 50 },
          min_rating: { type: "number", description: "最低豆瓣评分（0–10）", minimum: 0, maximum: 10 },
        },
        required: [],
      },
      execute: async () => notImplemented("电影推荐"),
    },
    {
      name: "movie_details",
      description:
        "根据豆瓣电影 ID 获取详细信息（功能开发中）。参数预留：movie_id、是否包含资源 include_resources。",
      parameters: {
        type: "object",
        properties: {
          movie_id: { type: "string", description: "豆瓣 subject ID，例如 1291546" },
          include_resources: {
            type: "boolean",
            description: "是否在结果中包含下载资源列表（尚未实现）",
          },
        },
        required: ["movie_id"],
      },
      execute: async () => notImplemented("电影详情"),
    },
    {
      name: "movie_find_resources",
      description: "查找电影磁力等资源（多源搜索与格式校验尚未接入）。",
      parameters: {
        type: "object",
        properties: {
          movie_id: { type: "string", description: "豆瓣电影 ID" },
          quality: { type: "string", description: "画质偏好：720p、1080p、4k 等" },
          language: { type: "string", description: "音轨/字幕语言偏好" },
          max_size_gb: { type: "number", description: "最大体积（GB）", minimum: 0 },
        },
        required: ["movie_id"],
      },
      execute: async () => notImplemented("电影资源搜索"),
    },
    {
      name: "movie_download",
      description: "将磁力任务提交至 qBittorrent（尚未接入）。",
      parameters: {
        type: "object",
        properties: {
          magnet_url: { type: "string", description: "磁力链接（magnet:?xt=...）" },
          movie_title: { type: "string", description: "电影标题，用于任务命名" },
          priority: {
            type: "string",
            description: "下载优先级：low、normal、high",
            enum: ["low", "normal", "high"],
          },
        },
        required: ["magnet_url", "movie_title"],
      },
      execute: async () => notImplemented("电影下载"),
    },
    {
      name: "movie_download_status",
      description: "查看下载队列与进度（尚未接入 qBittorrent 轮询）。",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "任务 ID；省略则列出全部任务" },
          active_only: { type: "boolean", description: "仅显示活动中的任务" },
          detailed: { type: "boolean", description: "是否包含速度、ETA 等详细信息" },
        },
        required: [],
      },
      execute: async () => notImplemented("下载状态查询"),
    },
    {
      name: "movie_cancel_download",
      description: "取消下载任务并可选择删除已下载部分（尚未接入）。",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "要取消的任务 ID" },
          delete_files: { type: "boolean", description: "是否删除已下载的部分文件，默认 true" },
          reason: { type: "string", description: "取消原因（可选）" },
        },
        required: ["task_id"],
      },
      execute: async () => notImplemented("取消下载"),
    },
    {
      name: "movie_pause_download",
      description: "暂停或恢复指定下载任务（尚未接入）。",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "任务 ID" },
          action: {
            type: "string",
            description: "操作：pause（暂停）或 resume（恢复）",
            enum: ["pause", "resume"],
          },
        },
        required: ["task_id", "action"],
      },
      execute: async () => notImplemented("暂停/恢复下载"),
    },
    {
      name: "movie_library",
      description: "管理本地电影库：列出、搜索、清理与整理（尚未接入）。",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "操作：list、search、cleanup、organize",
            enum: ["list", "search", "cleanup", "organize"],
          },
          query: { type: "string", description: "当 action 为 search 时的关键词" },
          sort: {
            type: "string",
            description: "排序：name、date、size、rating",
            enum: ["name", "date", "size", "rating"],
          },
        },
        required: ["action"],
      },
      execute: async () => notImplemented("本地电影库管理"),
    },
  ],
});

export type * from "./types.js";
export { FormatValidator } from "./format-validator.js";
export type { ValidationResult } from "./format-validator.js";
export { SecurityChecker } from "./utils/security.js";
export { MovieCache } from "./utils/cache.js";
export { DoubanAPI } from "./douban-api.js";
export type { SearchMoviesCacheOptions } from "./douban-api.js";
