import type { ToolDefinition } from "@nichijou/shared";
import type { Gateway } from "../gateway/gateway.js";
import type { FamilyManager } from "../family/family-manager.js";
import type { StorageManager } from "../storage/storage.js";
import { open, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { extname, isAbsolute, join, resolve as resolvePath, sep } from "node:path";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

// 辅助函数：从成员档案中解析昵称信息
function parseAliasesFromProfile(profile: string): string[] {
  const aliases: string[] = [];
  
  const aliasMatch = profile.match(/[-•]\s*昵称[\/别名]*\s*[:：]\s*([^\n\r]+)/i);
  if (aliasMatch && aliasMatch[1] && aliasMatch[1].trim() !== "（如：妈妈、爸爸、小明等，用逗号分隔多个昵称）") {
    const aliasText = aliasMatch[1].trim();
    aliases.push(...aliasText.split(/[,，;；、]\s*/).filter(alias => alias.trim()));
  }

  return aliases;
}

// 查找匹配的成员（支持姓名、昵称、ID）
function findMembersByQuery(query: string, familyManager: FamilyManager, storage: StorageManager) {
  const members = familyManager.getMembers();
  const matches: Array<{
    member: any;
    matchType: "id" | "name" | "alias" | "preferred";
    matchValue: string;
  }> = [];

  const queryLower = query.toLowerCase().trim();

  for (const member of members) {
    // 精确ID匹配
    if (member.id === query) {
      matches.push({ member, matchType: "id", matchValue: member.id });
      continue;
    }

    // 姓名匹配（精确和模糊）
    if (member.name.toLowerCase() === queryLower || member.name.toLowerCase().includes(queryLower)) {
      matches.push({ member, matchType: "name", matchValue: member.name });
      continue;
    }

    // 偏好称呼匹配
    if (member.preferredName && member.preferredName.toLowerCase() === queryLower) {
      matches.push({ member, matchType: "preferred", matchValue: member.preferredName });
      continue;
    }

    // 从档案中解析的昵称匹配
    const profile = storage.readMemberProfile(member.id);
    if (profile) {
      const profileAliases = parseAliasesFromProfile(profile);
      for (const alias of profileAliases) {
        if (alias.toLowerCase() === queryLower || alias.toLowerCase().includes(queryLower)) {
          matches.push({ member, matchType: "alias", matchValue: alias });
          break;
        }
      }
    }

    // FamilyMember.aliases 字段匹配
    if (member.aliases) {
      for (const alias of member.aliases) {
        if (alias.toLowerCase() === queryLower || alias.toLowerCase().includes(queryLower)) {
          matches.push({ member, matchType: "alias", matchValue: alias });
          break;
        }
      }
    }
  }

  return matches;
}

function resolveTargetMember(
  target: string,
  familyManager: FamilyManager,
  storage: StorageManager,
): { ok: true; memberId: string; displayName: string } | { ok: false; message: string } {
  const targetMember = familyManager.getMember(target);
  if (targetMember) {
    return {
      ok: true,
      memberId: targetMember.id,
      displayName: targetMember.preferredName || targetMember.name || targetMember.id,
    };
  }

  const matches = findMembersByQuery(target, familyManager, storage);
  if (matches.length === 0) {
    return {
      ok: false,
      message: `未找到匹配"${target}"的成员。请检查姓名、昵称或ID是否正确，或使用resolve_member工具查找准确信息。`,
    };
  }

  if (matches.length > 1) {
    let resultText = `找到多个匹配"${target}"的成员，请使用具体的成员ID：\n\n`;
    matches.forEach((match, index) => {
      const displayName = match.member.preferredName || match.member.name;
      resultText += `${index + 1}. ${displayName} - ID: ${match.member.id}\n`;
    });
    resultText += "\n请重新指定准确的成员ID。";
    return { ok: false, message: resultText };
  }

  const match = matches[0]!;
  return {
    ok: true,
    memberId: match.member.id,
    displayName: match.member.preferredName || match.member.name || match.member.id,
  };
}

function resolveLocalImagePath(input: string, storage: StorageManager): string {
  const value = input.trim();
  if (value.startsWith("file://")) {
    return fileURLToPath(value);
  }

  const mediaUrlPrefix = "/api/media/";
  if (value.startsWith(mediaUrlPrefix)) {
    const mediaRoot = resolvePath(storage.resolve("media"));
    const tail = decodeURIComponent(value.slice(mediaUrlPrefix.length).replace(/\+/g, " "));
    const resolved = resolvePath(mediaRoot, tail);
    if (resolved !== mediaRoot && !resolved.startsWith(mediaRoot + sep)) {
      throw new Error("本地图片路径越界，拒绝发送");
    }
    return resolved;
  }

  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }

  if (isAbsolute(value)) {
    return value;
  }

  return storage.resolve(value);
}

async function assertSupportedImageFile(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error("路径不是文件");
  }

  const extension = extname(filePath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`不支持的图片扩展名: ${extension || "无扩展名"}。支持 jpg、png、gif、webp、bmp。`);
  }

  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const isImage =
      (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) ||
      (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") ||
      (bytes.length >= 2 && bytes.subarray(0, 2).toString("ascii") === "BM");
    if (!isImage) {
      throw new Error("文件头不是受支持的图片格式");
    }
  } finally {
    await handle.close();
  }
}

export function createMessageTools(
  gateway: Gateway,
  familyManager: FamilyManager,
  storage: StorageManager,
  clearSessionFn: (memberId: string) => void,
  getCurrentMemberId?: () => string | undefined,
): ToolDefinition[] {
  return [
    {
      name: "send_message",
      description:
        "立即给其他家庭成员发送一条微信消息。" +
        "使用场景：" +
        "• 立即通知其他成员（「现在告诉妈妈我到家了」「马上发给爸爸今天的安排」）" +
        "• 转发AI任务执行结果给其他成员" +
        "• 跨成员传话和沟通" +
        "关键词识别：包含「现在」「马上」「立即」「告诉XX」「发给XX」等即时性词汇时使用。" +
        "注意：不适用于未来时间的提醒，那些请使用create_reminder工具。",
      parameters: {
        type: "object",
        properties: {
          target: { 
            type: "string", 
            description: "目标成员ID、姓名或昵称（推荐先用resolve_member工具获取准确的ID）" 
          },
          message: { type: "string", description: "消息内容" },
        },
        required: ["target", "message"],
      },
      execute: async (params) => {
        const target = (params.target as string).trim();
        const message = (params.message as string).trim();
        
        if (!target || !message) {
          return { content: "目标成员和消息内容不能为空", isError: true };
        }

        // 防误发保护：检查是否试图给自己发消息
        const currentMemberId = getCurrentMemberId?.();
        if (currentMemberId && target === currentMemberId) {
          return { 
            content: "无法给自己发送消息，请检查目标成员是否正确。", 
            isError: true 
          };
        }

        let targetMemberId = target;
        let targetMember = familyManager.getMember(target);
        
        // 如果不是有效的memberID，尝试通过姓名/昵称解析
        if (!targetMember) {
          const matches = findMembersByQuery(target, familyManager, storage);
          
          if (matches.length === 0) {
            return { 
              content: `未找到匹配"${target}"的成员。请检查姓名、昵称或ID是否正确，或使用resolve_member工具查找准确信息。`,
              isError: true 
            };
          }
          
          if (matches.length > 1) {
            let resultText = `找到多个匹配"${target}"的成员，请使用具体的成员ID：\n\n`;
            matches.forEach((match, index) => {
              const displayName = match.member.preferredName || match.member.name;
              resultText += `${index + 1}. ${displayName} - ID: ${match.member.id}\n`;
            });
            resultText += "\n请重新指定准确的成员ID。";
            
            return { content: resultText, isError: true };
          }
          
          // 唯一匹配，使用找到的成员
          const match = matches[0];
          targetMemberId = match.member.id;
          targetMember = match.member;
          
          // 再次检查防误发保护
          if (currentMemberId && targetMemberId === currentMemberId) {
            return { 
              content: "检测到您试图给自己发消息，已取消发送。", 
              isError: true 
            };
          }
        }

        try {
          await gateway.sendToMember(targetMemberId, message);
          
          const displayName = targetMember?.preferredName || targetMember?.name || targetMemberId;
          return { 
            content: `消息已成功发送给 ${displayName} (ID: ${targetMemberId})` 
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: `发送失败: ${msg}`, isError: true };
        }
      },
    },
    {
      name: "send_local_image",
      description:
        "发送本地图片文件给家庭成员或当前对话成员。" +
        "适用于用户明确给出本地图片路径、file:// 路径、media/... 路径或 /api/media/... 地址，并要求发送图片到微信聊天。" +
        "只支持本地图片文件，不用于生成图片；生成图片请使用 generate_image。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "目标成员ID、姓名或昵称；为空时发送给当前对话成员。",
          },
          image_path: {
            type: "string",
            description: "本地图片路径，支持绝对路径、file://、~/、media/... 或 /api/media/...。",
          },
          caption: {
            type: "string",
            description: "随图片发送的可选说明文字。",
          },
        },
        required: ["image_path"],
      },
      execute: async (params) => {
        const imagePathInput = typeof params.image_path === "string" ? params.image_path.trim() : "";
        const caption = typeof params.caption === "string" ? params.caption.trim() : undefined;
        const targetInput = typeof params.target === "string" ? params.target.trim() : "";
        const currentMemberId = getCurrentMemberId?.();

        if (!imagePathInput) {
          return { content: "image_path 不能为空", isError: true };
        }

        const target = targetInput || currentMemberId;
        if (!target) {
          return { content: "target 不能为空；当前上下文也没有可用成员 ID", isError: true };
        }

        const resolvedTarget = resolveTargetMember(target, familyManager, storage);
        if (!resolvedTarget.ok) {
          return { content: resolvedTarget.message, isError: true };
        }

        try {
          const filePath = resolveLocalImagePath(imagePathInput, storage);
          await assertSupportedImageFile(filePath);
          await gateway.sendMediaToMember(resolvedTarget.memberId, filePath, caption);
          return {
            content: `图片已发送给 ${resolvedTarget.displayName} (ID: ${resolvedTarget.memberId})\n路径: ${filePath}`,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: `发送本地图片失败: ${msg}`, isError: true };
        }
      },
    },
    {
      name: "clear_context",
      description:
        "清除指定成员的对话上下文记忆。当成员档案有重大更新、对话出现混乱、或需要重新开始对话时使用。",
      parameters: {
        type: "object",
        properties: {
          memberId: { type: "string", description: "成员 ID" },
        },
        required: ["memberId"],
      },
      execute: async (params) => {
        const memberId = params.memberId as string;
        if (!memberId) {
          return { content: "memberId 不能为空", isError: true };
        }
        clearSessionFn(memberId);
        return { content: `已清除成员 ${memberId} 的对话上下文，下次对话将开始全新会话` };
      },
    },
  ];
}
