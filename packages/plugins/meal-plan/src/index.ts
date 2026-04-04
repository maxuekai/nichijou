import { definePlugin } from "@nichijou/plugin-sdk";

export default definePlugin({
  id: "meal-plan",
  name: "家庭菜单",
  description: "菜谱管理、周菜单规划、菜品记录",
  version: "0.1.0",

  tools: [
    {
      name: "meal_add_recipe",
      description: "添加一道菜谱（名称、食材、做法）",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "菜名" },
          ingredients: {
            type: "array",
            items: { type: "string" },
            description: "食材列表",
          },
          instructions: { type: "string", description: "做法步骤" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签如: 川菜, 粤菜, 素食, 快手菜",
          },
        },
        required: ["name", "ingredients"],
      },
      execute: async (params) => {
        const name = params.name as string;
        const ingredients = params.ingredients as string[];
        return {
          content: `已添加菜谱「${name}」，食材: ${ingredients.join("、")}`,
        };
      },
    },
    {
      name: "meal_suggest_menu",
      description: "根据家庭成员的饮食偏好推荐本周菜单",
      parameters: {
        type: "object",
        properties: {
          preferences: { type: "string", description: "饮食偏好描述" },
          days: { type: "number", description: "规划几天" },
        },
      },
      execute: async (params) => {
        const days = (params.days as number) ?? 7;
        return {
          content: `已为你生成 ${days} 天的菜单建议。请根据家庭成员口味偏好进行调整。`,
        };
      },
    },
    {
      name: "meal_record_dish",
      description: "记录做过的一道菜（可配照片描述）",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "菜名" },
          description: { type: "string", description: "描述或心得" },
          rating: { type: "number", description: "评分 1-5" },
        },
        required: ["name"],
      },
      execute: async (params) => {
        const name = params.name as string;
        const rating = params.rating as number | undefined;
        return {
          content: `已记录「${name}」${rating ? ` 评分: ${"⭐".repeat(rating)}` : ""}`,
        };
      },
    },
  ],

  dashboardWidgets: [
    {
      id: "meal-wall",
      name: "菜单墙",
      component: "MealWall",
      defaultSize: "large",
    },
  ],
});
