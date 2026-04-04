import { definePlugin } from "@nichijou/plugin-sdk";

export default definePlugin({
  id: "fitness",
  name: "健身助手",
  description: "健身日提醒、运动装备清单、运动记录跟踪",
  version: "0.1.0",

  tools: [
    {
      name: "fitness_get_checklist",
      description: "获取健身前需要准备的装备清单",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "运动类型：gym（健身房）、run（跑步）、swim（游泳）、yoga（瑜伽）",
          },
        },
        required: ["type"],
      },
      execute: async (params) => {
        const checklists: Record<string, string[]> = {
          gym: ["运动鞋", "运动服", "毛巾", "水杯", "蛋白粉/能量棒", "耳机", "健身手套"],
          run: ["跑鞋", "运动衣", "运动裤", "运动手表", "水壶", "耳机"],
          swim: ["泳衣/泳裤", "泳帽", "泳镜", "毛巾", "洗漱用品", "拖鞋"],
          yoga: ["瑜伽垫", "运动服", "水杯", "毛巾"],
        };
        const type = params.type as string;
        const items = checklists[type] ?? checklists.gym!;
        return { content: `${type} 装备清单:\n${items.map((i) => `- ${i}`).join("\n")}` };
      },
    },
    {
      name: "fitness_log_workout",
      description: "记录一次运动",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "运动类型" },
          duration: { type: "number", description: "时长（分钟）" },
          notes: { type: "string", description: "备注" },
        },
        required: ["type", "duration"],
      },
      execute: async (params) => {
        const type = params.type as string;
        const duration = params.duration as number;
        const notes = params.notes as string | undefined;
        return {
          content: `已记录运动: ${type}, ${duration}分钟${notes ? `, 备注: ${notes}` : ""}`,
        };
      },
    },
  ],

  scheduledTasks: [
    {
      id: "fitness-reminder",
      cron: "0 20 * * *",
      description: "每晚8点检查明天是否有健身安排，提前提醒准备装备",
      execute: async (ctx) => {
        ctx.log("检查明日健身安排...");
      },
    },
  ],

  dashboardWidgets: [
    {
      id: "fitness-streak",
      name: "健身打卡",
      component: "FitnessStreak",
      defaultSize: "small",
    },
  ],
});
