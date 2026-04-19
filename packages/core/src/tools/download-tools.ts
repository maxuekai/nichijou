import type { ToolDefinition } from "@nichijou/shared";
import type { ButlerService } from "../butler.js";

export function createDownloadTools(butler: ButlerService): ToolDefinition[] {
  return [
    {
      name: "list_download_tasks",
      description: "查看当前用户的下载任务列表",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["all", "active", "completed", "error", "cancelled"],
            description: "要查看的任务状态，默认为active（活跃任务）"
          }
        }
      },
      execute: async (params) => {
        const { status = "active" } = params as { status?: string };
        const memberId = butler.getCurrentMemberId();
        
        if (!memberId) {
          return { content: "无法获取用户信息", isError: true };
        }

        try {
          const wechatChannel = butler.getWeChatChannel();
          if (!wechatChannel) {
            return { content: "微信通道未连接", isError: true };
          }

          // 获取所有下载统计信息
          const allStats = (wechatChannel as any).getAllDownloadStats();
          
          let allTasks: any[] = [];
          
          // 收集所有连接的任务
          for (const [connectionId, parser] of (wechatChannel as any).messageParsers.entries()) {
            const tasks = parser.getMemberDownloadTasks();
            allTasks = allTasks.concat(tasks.map((task: any) => ({ ...task, connectionId })));
          }

          // 筛选任务
          let filteredTasks = allTasks;
          if (status !== "all") {
            if (status === "active") {
              filteredTasks = allTasks.filter(task => 
                task.status === "downloading" || task.status === "pending"
              );
            } else {
              filteredTasks = allTasks.filter(task => task.status === status);
            }
          }

          if (filteredTasks.length === 0) {
            return { content: `没有${status === "all" ? "" : status === "active" ? "活跃的" : status}下载任务` };
          }

          let result = `📋 下载任务列表 (${filteredTasks.length}个任务):\n\n`;
          
          for (const task of filteredTasks) {
            const statusIcons: Record<string, string> = {
              pending: "⏳",
              downloading: "📥", 
              completed: "✅",
              error: "❌",
              cancelled: "🚫"
            };
            const statusIcon = statusIcons[task.status] || "❓";

            const progress = task.progress > 0 ? ` (${task.progress}%)` : "";
            const fileSize = task.totalSize > 0 ? formatFileSize(task.totalSize) : "未知大小";
            
            result += `${statusIcon} **${task.fileName}**${progress}\n`;
            result += `   类型: ${getMediaTypeName(task.mediaType)} | 大小: ${fileSize}\n`;
            result += `   状态: ${getStatusName(task.status)} | 任务ID: \`${task.id}\`\n`;
            
            if (task.status === "downloading" && task.progress > 0) {
              const duration = (Date.now() - task.startTime) / 1000;
              result += `   已用时: ${Math.round(duration)}秒\n`;
            }
            
            if (task.error) {
              result += `   错误: ${task.error}\n`;
            }
            
            result += "\n";
          }

          return { content: result };
        } catch (error) {
          console.error("[DownloadTools] 获取下载任务失败:", error);
          return { 
            content: `获取下载任务失败: ${error instanceof Error ? error.message : "未知错误"}`, 
            isError: true 
          };
        }
      }
    },

    {
      name: "cancel_download_task",
      description: "取消指定的下载任务",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "要取消的任务ID"
          },
          reason: {
            type: "string",
            description: "取消原因（可选）"
          }
        },
        required: ["taskId"]
      },
      execute: async (params) => {
        const { taskId, reason = "用户请求取消" } = params as { taskId: string; reason?: string };
        const memberId = butler.getCurrentMemberId();
        
        if (!memberId) {
          return { content: "无法获取用户信息", isError: true };
        }

        try {
          const wechatChannel = butler.getWeChatChannel();
          if (!wechatChannel) {
            return { content: "微信通道未连接", isError: true };
          }

          // 尝试从所有连接中取消任务
          let cancelled = false;
          for (const [connectionId] of (wechatChannel as any).messageParsers.entries()) {
            if ((wechatChannel as any).cancelConnectionDownloadTask(connectionId, taskId)) {
              cancelled = true;
              break;
            }
          }

          if (cancelled) {
            return { content: `✅ 下载任务已取消: \`${taskId}\`\n原因: ${reason}` };
          } else {
            return { content: `❌ 未找到任务ID: \`${taskId}\` 或任务无法取消`, isError: true };
          }
        } catch (error) {
          console.error("[DownloadTools] 取消下载任务失败:", error);
          return { 
            content: `取消下载任务失败: ${error instanceof Error ? error.message : "未知错误"}`, 
            isError: true 
          };
        }
      }
    },

    {
      name: "cancel_all_downloads",
      description: "取消当前用户的所有活跃下载任务",
      parameters: {
        type: "object",
        properties: {}
      },
      execute: async (params) => {
        const memberId = butler.getCurrentMemberId();
        
        if (!memberId) {
          return { content: "无法获取用户信息", isError: true };
        }

        try {
          const wechatChannel = butler.getWeChatChannel();
          if (!wechatChannel) {
            return { content: "微信通道未连接", isError: true };
          }

          let totalCancelled = 0;
          for (const [connectionId] of (wechatChannel as any).messageParsers.entries()) {
            const cancelled = (wechatChannel as any).cancelAllConnectionDownloadTasks(connectionId);
            totalCancelled += cancelled;
          }

          if (totalCancelled > 0) {
            return { content: `✅ 已取消 ${totalCancelled} 个下载任务` };
          } else {
            return { content: "没有需要取消的活跃下载任务" };
          }
        } catch (error) {
          console.error("[DownloadTools] 取消所有下载任务失败:", error);
          return { 
            content: `取消下载任务失败: ${error instanceof Error ? error.message : "未知错误"}`, 
            isError: true 
          };
        }
      }
    },

    {
      name: "download_stats",
      description: "查看下载统计信息",
      parameters: {
        type: "object",
        properties: {}
      },
      execute: async (params) => {
        const memberId = butler.getCurrentMemberId();
        
        if (!memberId) {
          return { content: "无法获取用户信息", isError: true };
        }

        try {
          const wechatChannel = butler.getWeChatChannel();
          if (!wechatChannel) {
            return { content: "微信通道未连接", isError: true };
          }

          const allStats = (wechatChannel as any).getAllDownloadStats();
          
          let totalStats = {
            total: 0,
            active: 0,
            completed: 0,
            cancelled: 0,
            error: 0,
            totalDownloaded: 0,
            averageSpeed: 0
          };

          let connectionCount = 0;
          let speedSum = 0;
          
          for (const stats of Object.values(allStats)) {
            if (stats && typeof stats === 'object') {
              const typedStats = stats as any;
              totalStats.total += typedStats.total || 0;
              totalStats.active += typedStats.active || 0;
              totalStats.completed += typedStats.completed || 0;
              totalStats.cancelled += typedStats.cancelled || 0;
              totalStats.error += typedStats.error || 0;
              totalStats.totalDownloaded += typedStats.totalDownloaded || 0;
              
              if (typedStats.averageSpeed && typedStats.averageSpeed > 0) {
                speedSum += typedStats.averageSpeed;
                connectionCount++;
              }
            }
          }

          totalStats.averageSpeed = connectionCount > 0 ? Math.round(speedSum / connectionCount) : 0;

          let result = `📊 **下载统计信息**\n\n`;
          result += `总任务数: ${totalStats.total}\n`;
          result += `活跃任务: ${totalStats.active}\n`;
          result += `已完成: ${totalStats.completed}\n`;
          result += `已取消: ${totalStats.cancelled}\n`;
          result += `错误任务: ${totalStats.error}\n`;
          result += `总下载量: ${formatFileSize(totalStats.totalDownloaded)}\n`;
          
          if (totalStats.averageSpeed > 0) {
            result += `平均速度: ${formatFileSize(totalStats.averageSpeed)}/s\n`;
          }

          return { content: result };
        } catch (error) {
          console.error("[DownloadTools] 获取下载统计失败:", error);
          return { 
            content: `获取下载统计失败: ${error instanceof Error ? error.message : "未知错误"}`, 
            isError: true 
          };
        }
      }
    }
  ];
}

// 辅助函数
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getMediaTypeName(type: string): string {
  const typeMap: Record<string, string> = {
    image: '图片',
    voice: '语音',
    video: '视频',
    file: '文件',
  };
  return typeMap[type] || type;
}

function getStatusName(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '等待中',
    downloading: '下载中',
    completed: '已完成',
    error: '错误',
    cancelled: '已取消',
  };
  return statusMap[status] || status;
}