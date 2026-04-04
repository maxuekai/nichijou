import { useEffect, useState } from "react";
import { api } from "../../api";

interface StatusData {
  setupCompleted: boolean;
  llm: { baseUrl: string; model: string };
  channels: Record<string, { connected: boolean; totalMembers?: number; connectedMembers?: number; expiredMembers?: string[] }>;
  tokenUsage: { promptTokens: number; completionTokens: number };
}

export function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    const data = await api.getStatus();
    setStatus(data as StatusData);
  }

  if (!status) return <div className="text-stone-400">加载中...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-stone-800">系统状态</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LLM Status */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-stone-500">LLM 模型</h3>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              可用
            </span>
          </div>
          <p className="text-lg font-semibold text-stone-800">{status.llm.model}</p>
          <p className="text-sm text-stone-500 mt-1">{status.llm.baseUrl}</p>
        </div>

        {/* Token Usage */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-4">今日 Token 用量</h3>
          <div className="flex gap-8">
            <div>
              <p className="text-2xl font-bold text-stone-800">{status.tokenUsage.promptTokens.toLocaleString()}</p>
              <p className="text-xs text-stone-400 mt-1">Prompt</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-stone-800">{status.tokenUsage.completionTokens.toLocaleString()}</p>
              <p className="text-xs text-stone-400 mt-1">Completion</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">
                {(status.tokenUsage.promptTokens + status.tokenUsage.completionTokens).toLocaleString()}
              </p>
              <p className="text-xs text-stone-400 mt-1">总计</p>
            </div>
          </div>
        </div>

        {/* WeChat Channels */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-4">微信通道</h3>
          {Object.entries(status.channels).length === 0 ? (
            <p className="text-sm text-stone-400">暂无通道连接</p>
          ) : (
            Object.entries(status.channels).map(([id, ch]) => (
              <div key={id} className="flex items-center justify-between py-2">
                <span className="text-sm text-stone-700">{id}</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                  ch.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ch.connected ? "bg-green-500" : "bg-red-500"}`} />
                  {ch.connected ? `${ch.connectedMembers}/${ch.totalMembers} 在线` : "离线"}
                </span>
              </div>
            ))
          )}
        </div>

        {/* System */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-4">系统信息</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">初始设置</span>
              <span className={status.setupCompleted ? "text-green-600" : "text-amber-600"}>
                {status.setupCompleted ? "已完成" : "未完成"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">运行环境</span>
              <span className="text-stone-700">Node.js</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
