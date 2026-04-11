import { useEffect, useState } from "react";
import { api } from "../../api";

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

interface FamilyRoutine {
  id: string;
  title: string;
  description?: string;
  assigneeMemberIds?: string[];
  weekdays: number[];
  time?: string;
}

interface FamilyOverride {
  id: string;
  action: string;
  date?: string;
  dateRange?: { start: string; end: string };
  assigneeMemberIds?: string[];
  title?: string;
  reason?: string;
}

export function FamilyPage() {
  const [family, setFamily] = useState<{ id: string; name: string; avatar?: string } | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [familyName, setFamilyName] = useState("");
  const [savingFamily, setSavingFamily] = useState(false);

  const [plans, setPlans] = useState<{ routines: FamilyRoutine[]; overrides: FamilyOverride[] }>({ routines: [], overrides: [] });
  const [editingRoutine, setEditingRoutine] = useState<FamilyRoutine | null>(null);
  const [editingOverride, setEditingOverride] = useState<FamilyOverride | null>(null);
  const [assigneeInput, setAssigneeInput] = useState("@all");

  useEffect(() => {
    void loadFamily();
    void loadPlans();
  }, []);

  async function loadFamily() {
    const data = await api.getFamily();
    setFamily(data.family);
    setMembers(data.members.map((m) => ({ id: m.id, name: m.name })));
    setFamilyName(data.family?.name ?? "");
  }

  async function loadPlans() {
    try {
      const data = await api.getFamilyPlans();
      setPlans({
        routines: data.routines as unknown as FamilyRoutine[],
        overrides: data.overrides as unknown as FamilyOverride[],
      });
    } catch { /* ignore */ }
  }

  function parseAssignees(input: string): string[] {
    const text = input.trim();
    if (!text || text.includes("@all")) return members.map((m) => m.id);
    const names = text.match(/@([^\s,]+)/g)?.map((token) => token.slice(1)) ?? [];
    const ids = members
      .filter((m) => names.includes(m.name) || names.includes(m.id))
      .map((m) => m.id);
    return ids.length > 0 ? ids : members.map((m) => m.id);
  }

  function formatAssignees(ids?: string[]): string {
    if (!ids || ids.length === 0 || ids.length === members.length) return "@all";
    return ids.map((id) => `@${members.find((m) => m.id === id)?.name ?? id}`).join(" ");
  }

  function formatWeekdays(weekdays: number[]): string {
    return weekdays.map((d) => `周${WEEKDAY_NAMES[d]}`).join("、");
  }

  async function saveFamily() {
    if (!familyName.trim()) return;
    setSavingFamily(true);
    try {
      await api.updateFamily({ name: familyName.trim() });
      await loadFamily();
    } finally {
      setSavingFamily(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">家庭</h1>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h3 className="text-sm font-medium text-stone-500 mb-4">家庭信息</h3>
        <div className="flex items-center gap-3">
          <label className="relative cursor-pointer group">
            {family?.avatar ? (
              <img src={api.avatarUrl(family.avatar)} alt={family.name} className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold">
                {(family?.name ?? "家").charAt(0)}
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await api.uploadFamilyAvatar(file);
                await loadFamily();
              }}
            />
          </label>
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              placeholder="家庭名称"
            />
            <button
              onClick={saveFamily}
              disabled={savingFamily || !familyName.trim()}
              className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {savingFamily ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-stone-500">家庭习惯 · {plans.routines.length} 项</h3>
          <button
            onClick={() => {
              setAssigneeInput("@all");
              setEditingRoutine({
                id: `rtn_${Date.now().toString(36)}`,
                title: "",
                description: "",
                weekdays: [],
                assigneeMemberIds: members.map((m) => m.id),
              });
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            + 新增家庭习惯
          </button>
        </div>
        {plans.routines.length === 0 ? (
          <p className="text-sm text-stone-400 py-4 text-center">暂无家庭习惯</p>
        ) : (
          <div className="space-y-2">
            {plans.routines.map((r) => (
              <div key={r.id} className="p-3 rounded-lg bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-800">{r.title}</p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {formatAssignees(r.assigneeMemberIds)} · {formatWeekdays(r.weekdays)}{r.time ? ` · ${r.time}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setAssigneeInput(formatAssignees(r.assigneeMemberIds));
                      setEditingRoutine({ ...r });
                    }}
                    className="px-2 py-1 text-xs rounded border border-stone-300 text-stone-600 hover:bg-stone-100"
                  >
                    编辑
                  </button>
                  <button
                    onClick={async () => {
                      await api.deleteFamilyRoutine(r.id);
                      await loadPlans();
                    }}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-stone-500">家庭临时变动 · {plans.overrides.length} 项</h3>
          <button
            onClick={() => {
              setAssigneeInput("@all");
              setEditingOverride({
                id: `ovr_${Date.now().toString(36)}`,
                action: "add",
                date: new Date().toISOString().split("T")[0],
                assigneeMemberIds: members.map((m) => m.id),
              });
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            + 新增家庭临时变动
          </button>
        </div>
        {plans.overrides.length === 0 ? (
          <p className="text-sm text-stone-400 py-4 text-center">暂无家庭临时变动</p>
        ) : (
          <div className="space-y-2">
            {plans.overrides.map((o) => (
              <div key={o.id} className="p-3 rounded-lg bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-800">{o.title ?? "家庭临时变动"}</p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {formatAssignees(o.assigneeMemberIds)} · {o.action} · {o.date ?? (o.dateRange ? `${o.dateRange.start} ~ ${o.dateRange.end}` : "")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setAssigneeInput(formatAssignees(o.assigneeMemberIds));
                      setEditingOverride({ ...o });
                    }}
                    className="px-2 py-1 text-xs rounded border border-stone-300 text-stone-600 hover:bg-stone-100"
                  >
                    编辑
                  </button>
                  <button
                    onClick={async () => {
                      await api.deleteFamilyOverride(o.id);
                      await loadPlans();
                    }}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingRoutine && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingRoutine(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800 mb-4">家庭习惯</h3>
            <div className="space-y-3">
              <input type="text" value={editingRoutine.title} onChange={(e) => setEditingRoutine({ ...editingRoutine, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="标题" />
              <input type="text" value={assigneeInput} onChange={(e) => setAssigneeInput(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="@all 或 @成员名" />
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      const weekdays = editingRoutine.weekdays.includes(d)
                        ? editingRoutine.weekdays.filter((x) => x !== d)
                        : [...editingRoutine.weekdays, d].sort();
                      setEditingRoutine({ ...editingRoutine, weekdays });
                    }}
                    className={`w-8 h-8 rounded-full text-xs ${editingRoutine.weekdays.includes(d) ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-400"}`}
                  >
                    {WEEKDAY_NAMES[d]}
                  </button>
                ))}
              </div>
              <input type="time" value={editingRoutine.time ?? ""} onChange={(e) => setEditingRoutine({ ...editingRoutine, time: e.target.value || undefined })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" />
              <textarea value={editingRoutine.description ?? ""} onChange={(e) => setEditingRoutine({ ...editingRoutine, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm resize-none" placeholder="描述" />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditingRoutine(null)} className="px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100">取消</button>
              <button
                onClick={async () => {
                  await api.upsertFamilyRoutine(editingRoutine.id, {
                    ...editingRoutine,
                    assigneeMemberIds: parseAssignees(assigneeInput),
                  });
                  setEditingRoutine(null);
                  await loadPlans();
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {editingOverride && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingOverride(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800 mb-4">家庭临时变动</h3>
            <div className="space-y-3">
              <input type="text" value={assigneeInput} onChange={(e) => setAssigneeInput(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="@all 或 @成员名" />
              <select value={editingOverride.action} onChange={(e) => setEditingOverride({ ...editingOverride, action: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm">
                <option value="skip">跳过</option>
                <option value="add">新增</option>
                <option value="modify">修改</option>
              </select>
              <input type="date" value={editingOverride.date ?? ""} onChange={(e) => setEditingOverride({ ...editingOverride, date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" />
              <input type="text" value={editingOverride.title ?? ""} onChange={(e) => setEditingOverride({ ...editingOverride, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="标题" />
              <input type="text" value={editingOverride.reason ?? ""} onChange={(e) => setEditingOverride({ ...editingOverride, reason: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="原因" />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditingOverride(null)} className="px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100">取消</button>
              <button
                onClick={async () => {
                  await api.upsertFamilyOverride(editingOverride.id, {
                    ...editingOverride,
                    assigneeMemberIds: parseAssignees(assigneeInput),
                  });
                  setEditingOverride(null);
                  await loadPlans();
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
