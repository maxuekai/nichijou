import type { ToolDefinition } from "@nichijou/shared";
import type { FamilyManager } from "../family/family-manager.js";
import type { StorageManager } from "../storage/storage.js";

export function createFamilyTools(
  familyManager: FamilyManager,
  storage: StorageManager,
): ToolDefinition[] {
  return [
    {
      name: "get_family_info",
      description: "获取当前家庭信息和所有成员列表",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const family = familyManager.getFamily();
        const members = familyManager.getMembers();
        return {
          content: JSON.stringify({ family, members }, null, 2),
        };
      },
    },
    {
      name: "get_member_profile",
      description: "读取某个家庭成员的档案（包含习惯、偏好、AI 观察笔记等）",
      parameters: {
        type: "object",
        properties: {
          memberId: { type: "string", description: "成员 ID" },
        },
        required: ["memberId"],
      },
      execute: async (params) => {
        const profile = storage.readMemberProfile(params.memberId as string);
        if (!profile) return { content: "成员档案不存在", isError: true };
        return { content: profile };
      },
    },
    {
      name: "update_member_profile",
      description: "更新家庭成员的档案信息（按 section 追加或替换）。section 是 Markdown 的 ## 标题",
      parameters: {
        type: "object",
        properties: {
          memberId: { type: "string", description: "成员 ID" },
          section: { type: "string", description: "要更新的 section 标题，如 '生活习惯'" },
          content: { type: "string", description: "新内容" },
          mode: { type: "string", enum: ["append", "replace"], description: "追加还是替换" },
        },
        required: ["memberId", "section", "content"],
      },
      execute: async (params) => {
        const memberId = params.memberId as string;
        const section = params.section as string;
        const newContent = params.content as string;
        const mode = (params.mode as string) ?? "append";

        let profile = storage.readMemberProfile(memberId);
        if (!profile) return { content: "成员档案不存在", isError: true };

        const sectionHeader = `## ${section}`;
        const sectionIdx = profile.indexOf(sectionHeader);

        if (sectionIdx < 0) {
          profile += `\n${sectionHeader}\n${newContent}\n`;
        } else {
          const nextSectionMatch = profile.slice(sectionIdx + sectionHeader.length).match(/\n## /);
          const sectionEnd = nextSectionMatch
            ? sectionIdx + sectionHeader.length + nextSectionMatch.index!
            : profile.length;

          if (mode === "replace") {
            profile =
              profile.slice(0, sectionIdx) +
              `${sectionHeader}\n${newContent}\n` +
              profile.slice(sectionEnd);
          } else {
            const insertPos = sectionEnd;
            profile =
              profile.slice(0, insertPos) +
              `${newContent}\n` +
              profile.slice(insertPos);
          }
        }

        storage.writeMemberProfile(memberId, profile);
        return { content: `已更新 ${section}` };
      },
    },
  ];
}
