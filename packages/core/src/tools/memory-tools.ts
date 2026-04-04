import type { ToolDefinition } from "@nichijou/shared";
import { formatDate } from "@nichijou/shared";
import type { StorageManager } from "../storage/storage.js";

export function createMemoryTools(storage: StorageManager): ToolDefinition[] {
  return [
    {
      name: "add_observation",
      description: "记录对成员的观察笔记，会追加到成员档案的 AI 观察笔记 section",
      parameters: {
        type: "object",
        properties: {
          memberId: { type: "string" },
          observation: { type: "string", description: "观察内容" },
        },
        required: ["memberId", "observation"],
      },
      execute: async (params) => {
        const memberId = params.memberId as string;
        const observation = params.observation as string;
        const dateStr = formatDate(new Date());

        let profile = storage.readMemberProfile(memberId);
        if (!profile) return { content: "成员档案不存在", isError: true };

        const section = "## AI 观察笔记";
        const sectionIdx = profile.indexOf(section);

        const entry = `> [${dateStr}] ${observation}`;

        if (sectionIdx < 0) {
          profile += `\n${section}\n${entry}\n`;
        } else {
          const insertPos = sectionIdx + section.length;
          profile =
            profile.slice(0, insertPos) +
            `\n${entry}` +
            profile.slice(insertPos);
        }

        storage.writeMemberProfile(memberId, profile);
        return { content: "已记录观察笔记" };
      },
    },
  ];
}
