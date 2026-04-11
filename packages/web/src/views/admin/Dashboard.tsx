import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";

export function Dashboard() {
  const navigate = useNavigate();
  const [family, setFamily] = useState<{ family: { id: string; name: string; avatar?: string } | null; members: Array<{ id: string; name: string; role: string }> } | null>(null);
  const [status, setStatus] = useState<{ llm: { model: string; baseUrl: string }; tokenUsage: { promptTokens: number; completionTokens: number } } | null>(null);

  useEffect(() => {
    api.getFamily().then((data) => {
      setFamily(data);
    });
    api.getStatus().then(setStatus);
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-stone-800">家庭概览</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Family Card */}
        <button
          onClick={() => navigate("/admin/family")}
          className="bg-white rounded-xl border border-stone-200 p-6 text-left hover:border-amber-300 hover:shadow-sm transition-all"
        >
          <h3 className="text-sm font-medium text-stone-500 mb-3">家庭</h3>
          {family?.family?.avatar && (
            <img src={api.avatarUrl(family.family.avatar)} alt={family.family.name} className="w-10 h-10 rounded-full object-cover mb-3" />
          )}
          <p className="text-2xl font-bold text-stone-800">{family?.family?.name ?? "未创建"}</p>
          <p className="text-sm text-stone-500 mt-1">{family?.members?.length ?? 0} 位成员</p>
          <p className="text-xs text-amber-600 mt-3">点击进入家庭管理</p>
        </button>

        {/* LLM Card */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-3">AI 模型</h3>
          <p className="text-2xl font-bold text-stone-800">{status?.llm?.model ?? "-"}</p>
          <p className="text-sm text-stone-500 mt-1 truncate">{status?.llm?.baseUrl ?? "-"}</p>
        </div>

        {/* Token Usage Card */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-3">今日 Token</h3>
          <p className="text-2xl font-bold text-stone-800">{status?.tokenUsage?.promptTokens ?? 0}</p>
          <p className="text-sm text-stone-500 mt-1">prompt + {status?.tokenUsage?.completionTokens ?? 0} completion</p>
        </div>
      </div>

      {/* Members */}
      {family?.members && family.members.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h3 className="text-sm font-medium text-stone-500 mb-4">家庭成员</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {family.members.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate("/admin/members")}
                className="flex items-center gap-3 p-3 rounded-lg bg-stone-50 text-left hover:bg-stone-100 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-medium">
                  {m.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">{m.name}</p>
                  <p className="text-xs text-stone-400">{m.role === "admin" ? "管理员" : "成员"}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
