import { definePlugin } from "@nichijou/plugin-sdk";

export default definePlugin({
  id: "travel",
  name: "出行规划",
  description: "搜索推荐打卡地点、生成行程规划",
  version: "0.1.0",

  tools: [
    {
      name: "travel_search_places",
      description: "搜索附近或指定城市的热门打卡地点",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词，如 '周末亲子游'" },
          city: { type: "string", description: "城市名" },
          type: {
            type: "string",
            description: "类型: outdoor（户外）, food（美食）, culture（文化）, all（全部）",
          },
        },
        required: ["query"],
      },
      execute: async (params) => {
        const query = params.query as string;
        const city = params.city as string | undefined;
        return {
          content: `搜索「${query}」${city ? ` (${city})` : ""} 的推荐地点。\n注意: 需要接入小红书 API 或搜索引擎获取真实数据。当前为演示模式。`,
        };
      },
    },
    {
      name: "travel_plan_trip",
      description: "根据目的地和时间生成行程规划",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string", description: "目的地" },
          date: { type: "string", description: "出发日期" },
          duration: { type: "string", description: "时长，如 '半天'、'一天'" },
          preferences: { type: "string", description: "偏好描述" },
        },
        required: ["destination"],
      },
      execute: async (params) => {
        const dest = params.destination as string;
        const duration = params.duration as string | undefined;
        return {
          content: `已为你规划${duration ?? "一天"}的「${dest}」行程。详细规划需要 AI 根据实际数据生成。`,
        };
      },
    },
  ],

  dashboardWidgets: [
    {
      id: "travel-upcoming",
      name: "近期出行",
      component: "TravelUpcoming",
      defaultSize: "medium",
    },
  ],
});
