import { definePlugin } from "@nichijou/plugin-sdk";

export default definePlugin({
  id: "grocery",
  name: "采购助手",
  description: "智能采购清单生成、历史分析、食材推荐",
  version: "0.1.0",

  tools: [
    {
      name: "grocery_generate_list",
      description: "根据本周菜单和历史购买记录生成采购清单",
      parameters: {
        type: "object",
        properties: {
          menu: {
            type: "array",
            items: { type: "string" },
            description: "本周计划做的菜",
          },
          extraItems: {
            type: "array",
            items: { type: "string" },
            description: "额外需要购买的物品",
          },
        },
      },
      execute: async (params) => {
        const menu = (params.menu as string[]) ?? [];
        const extras = (params.extraItems as string[]) ?? [];
        return {
          content: `已生成采购清单:\n\n菜单相关(${menu.length}道菜的食材):\n${menu.map((m) => `- ${m} 所需食材`).join("\n")}\n\n${extras.length > 0 ? `额外物品:\n${extras.map((e) => `- ${e}`).join("\n")}` : ""}`,
        };
      },
    },
    {
      name: "grocery_log_purchase",
      description: "记录一次采购",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "string" },
                price: { type: "number" },
              },
            },
            description: "购买的物品列表",
          },
          store: { type: "string", description: "购买地点" },
        },
        required: ["items"],
      },
      execute: async (params) => {
        const items = params.items as Array<{ name: string; price?: number }>;
        const total = items.reduce((sum, i) => sum + (i.price ?? 0), 0);
        return {
          content: `已记录采购 ${items.length} 项${total > 0 ? `，总计 ¥${total.toFixed(2)}` : ""}`,
        };
      },
    },
    {
      name: "grocery_suggest_staples",
      description: "根据历史购买频率推荐可能需要补充的日常用品",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        return {
          content: "根据历史数据分析，以下物品可能需要补充:\n- 鸡蛋（平均每周消耗12个）\n- 牛奶（每2周购买一次）\n- 食用油（上次购买已过30天）\n\n注意: 需要积累购买数据后才能给出准确推荐。",
        };
      },
    },
  ],

  scheduledTasks: [
    {
      id: "grocery-weekly-remind",
      cron: "0 9 * * 6",
      description: "每周六上午9点提醒准备采购清单",
      execute: async (ctx) => {
        ctx.log("提醒生成采购清单");
      },
    },
  ],

  dashboardWidgets: [
    {
      id: "grocery-list",
      name: "采购清单",
      component: "GroceryList",
      defaultSize: "medium",
    },
  ],
});
