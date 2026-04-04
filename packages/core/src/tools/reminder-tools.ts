import type { ToolDefinition } from "@nichijou/shared";
import type { Gateway } from "../gateway/gateway.js";

const activeTimers = new Map<string, NodeJS.Timeout>();

export function createReminderTools(gateway: Gateway): ToolDefinition[] {
  return [
    {
      name: "set_timer_reminder",
      description:
        "设置一个短期定时提醒。在指定分钟数后通过微信发送提醒消息给成员。" +
        "适用于「X分钟后提醒我做某事」这类即时定时需求。",
      parameters: {
        type: "object",
        properties: {
          memberId: { type: "string", description: "成员 ID" },
          delayMinutes: { type: "number", description: "延迟分钟数（支持小数，如 0.5 = 30秒）" },
          message: { type: "string", description: "提醒内容" },
        },
        required: ["memberId", "delayMinutes", "message"],
      },
      execute: async (params) => {
        const memberId = params.memberId as string;
        const delayMinutes = params.delayMinutes as number;
        const message = params.message as string;

        if (delayMinutes <= 0 || delayMinutes > 1440) {
          return { content: "延迟时间需在 0-1440 分钟之间", isError: true };
        }

        const timerId = `timer_${memberId}_${Date.now()}`;
        const delayMs = Math.round(delayMinutes * 60 * 1000);

        const timer = setTimeout(async () => {
          activeTimers.delete(timerId);
          try {
            await gateway.sendToMember(memberId, `⏰ 提醒：${message}`);
          } catch (err) {
            console.error(`[Timer] 发送提醒失败:`, err);
          }
        }, delayMs);

        activeTimers.set(timerId, timer);

        const displayTime =
          delayMinutes >= 60
            ? `${Math.floor(delayMinutes / 60)}小时${delayMinutes % 60 > 0 ? `${Math.round(delayMinutes % 60)}分钟` : ""}`
            : delayMinutes >= 1
              ? `${Math.round(delayMinutes)}分钟`
              : `${Math.round(delayMinutes * 60)}秒`;

        return { content: `已设置 ${displayTime} 后的提醒：「${message}」` };
      },
    },
  ];
}
