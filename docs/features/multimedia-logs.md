# 多媒体消息日志功能

## 功能概述

在管理后台查看对话日志时，可展示用户消息中的图片、语音、文件、视频等多媒体元数据：缩略图、下载、语音转录与媒体处理状态等。

## 功能特性

- 支持图片、语音、文件、视频等媒体类型展示
- 图片等媒体缩略图预览（由服务端按需生成 JPEG）
- 文件下载（浏览器侧通过 `/api/media/...` 拉取后触发下载）
- 语音转录等处理结果展示（`processedMedia`）
- 下载 / 处理状态与错误信息展示
- 管理页布局适配常见视口宽度

## 使用方法

1. 启动服务后打开管理后台对话日志页：`http://localhost:3000/admin/logs`
2. 列表中会渲染每条日志关联的媒体区块（若有 `mediaContent`）
3. 点击媒体卡片可触发预览（当前实现为在新标签页打开原始媒体 URL）
4. 点击下载图标可下载对应文件（使用日志中的 `originalName` 作为下载文件名优先）
5. 若存在语音转写等处理记录，会在「处理结果」区域展示

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/logs` | 获取最近对话日志（默认最多 200 条），包含 `mediaContent`、`processedMedia` 等字段；响应中 `memberName` 由服务端按成员表补全 |
| `GET` | `/api/logs/:memberId` | 按成员获取最近日志（当前为通用字段，不含媒体 JSON 列；管理端「全部日志」页使用上面的聚合接口） |
| `POST` | `/api/logs/cleanup` | 按保留天数清理过期对话日志；请求体可选 `{ "daysToKeep": number }`（默认 90，允许范围 0–365） |
| `GET` / `HEAD` | `/api/media/{filePath}` | 读取 `filePath` 相对媒体根目录下的文件（路径需 URL 编码；防止路径穿越） |
| `GET` / `HEAD` | `/api/media/{filePath}/thumbnail` | 为支持的图片扩展名生成正方形 JPEG 缩略图；查询参数 `size` 可选 `small`（64）、`medium`（128，默认）、`large`（256） |

前端封装见 `packages/web/src/api.ts` 中的 `getMediaFile`、`getThumbnail`、`downloadMedia`。

## 技术实现

- **前端**：React、TypeScript、TailwindCSS；媒体区块组件位于 `packages/web/src/components/multimedia/`
- **后端**：Node.js、`packages/core` HTTP 服务、SQLite（`better-sqlite3`）
- **媒体根目录**：默认 `~/.nichijou/media`（与 `StorageManager.dataDir` 一致）；若在配置中为多媒体指定 `storage.base_path`，则以该路径为媒体管理器根目录；HTTP 静态访问仍解析自 `dataDir` 下的相对路径约定，与数据库存储的 `filePath` 一致即可
- **缩略图**：使用 [Sharp](https://sharp.pixelplumbing.com/) 在服务端缩放并输出 JPEG
- **图标**：[@heroicons/react](https://heroicons.com/)（outline）

## 故障排除

### 媒体文件无法访问

- 确认日志里的 `filePath` 与磁盘上 `~/.nichijou/media/`（或自定义 `base_path`）下相对路径一致
- 确认运行用户对上述目录有读权限
- 查看服务端日志中 `[Server] Media stream error` 或 `Media access error` 相关输出

### 缩略图生成失败

- 确认依赖已正确安装（`sharp` 随 `packages/core` 构建使用）
- 确认源文件为受支持的图片类型且未损坏
- 大图批量缩略时注意进程内存；失败时接口返回 500，日志中有 `[Server] Thumbnail generation error`

### 日志列表没有媒体块

- 仅在新版写入路径下持久化的记录会带 `media_content` / `processed_media`；旧数据可能仅有纯文本字段
- 确认微信等多媒体入口已走 `saveConversationLogWithMedia` 一类写入逻辑
