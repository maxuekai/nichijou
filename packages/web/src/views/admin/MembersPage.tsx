import { useEffect, useState } from "react";
import { api } from "../../api";

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

interface Routine {
  id: string;
  title: string;
  weekdays: number[];
  timeSlot?: string;
  time?: string;
  reminders: Array<{ offsetMinutes: number; message: string; channel: string }>;
}

interface Override {
  id: string;
  date?: string;
  dateRange?: { start: string; end: string };
  action: string;
  routineId?: string;
  title?: string;
  reason?: string;
  timeSlot?: string;
}

interface DayPlanItem {
  id: string;
  title: string;
  timeSlot?: string;
  time?: string;
  source: string;
}

interface MemberDetail {
  member: { id: string; name: string; role: string; channelBindings: Record<string, string> };
  profile: string;
  routines: Routine[];
  overrides: Override[];
  dayPlan: { date: string; items: DayPlanItem[] };
}

export function MembersPage() {
  const [members, setMembers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [tab, setTab] = useState<"profile" | "routines" | "plan">("plan");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggestedRoutines, setSuggestedRoutines] = useState<Routine[]>([]);
  const [selectedRoutineIdx, setSelectedRoutineIdx] = useState<Set<number>>(new Set());
  const [showRoutinePreview, setShowRoutinePreview] = useState(false);
  const [applyingRoutines, setApplyingRoutines] = useState(false);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    const data = await api.getFamily();
    setMembers(data.members);
  }

  async function addMember() {
    if (!newName.trim()) return;
    await api.addMember(newName.trim());
    setNewName("");
    loadMembers();
  }

  async function selectMember(id: string) {
    setSelectedId(id);
    setTab("plan");
    try {
      const res = await fetch(`/api/members/${id}`);
      const data = await res.json() as MemberDetail;
      setDetail(data);
    } catch { /* ignore */ }
  }

  function startEditing() {
    setEditContent(detail?.profile ?? "");
    setEditing(true);
  }

  async function saveProfile() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch(`/api/members/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: editContent }),
      });
      setEditing(false);
      selectMember(selectedId);
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function generateRoutines() {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/members/${selectedId}/generate-routines`, { method: "POST" });
      const data = await res.json() as { ok: boolean; routines: Routine[]; error?: string };
      if (data.ok && data.routines.length > 0) {
        setSuggestedRoutines(data.routines);
        setSelectedRoutineIdx(new Set(data.routines.map((_, i) => i)));
        setShowRoutinePreview(true);
      } else if (data.routines.length === 0) {
        alert("未从档案中识别出周期性习惯，请确保档案中有描述日常生活习惯的内容。");
      } else if (data.error) {
        alert(`生成失败: ${data.error}`);
      }
    } catch {
      alert("生成失败，请检查 LLM 连接。");
    }
    setGenerating(false);
  }

  function toggleRoutine(idx: number) {
    setSelectedRoutineIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function applySelectedRoutines() {
    if (!selectedId) return;
    setApplyingRoutines(true);
    const selected = suggestedRoutines.filter((_, i) => selectedRoutineIdx.has(i));
    try {
      await fetch(`/api/members/${selectedId}/apply-routines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routines: selected }),
      });
      setShowRoutinePreview(false);
      setSuggestedRoutines([]);
      selectMember(selectedId);
      setTab("routines");
    } catch { /* ignore */ }
    setApplyingRoutines(false);
  }

  async function deleteMember(id: string) {
    try {
      await fetch(`/api/members/${id}`, { method: "DELETE" });
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
      loadMembers();
    } catch { /* ignore */ }
    setDeleting(null);
  }

  function formatWeekdays(weekdays: number[]): string {
    return weekdays.map((d) => `周${WEEKDAY_NAMES[d]}`).join("、");
  }

  function formatTimeSlot(slot?: string): string {
    if (!slot) return "";
    const labels: Record<string, string> = { morning: "上午", afternoon: "下午", evening: "晚上" };
    return labels[slot] ?? slot;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">家庭成员</h1>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
            placeholder="新成员名字"
            className="px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
          <button
            onClick={addMember}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            添加
          </button>
        </div>
      </div>

      {members.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <p className="text-sm text-amber-800 font-medium">暂无成员</p>
          <p className="text-sm text-amber-600 mt-1">添加的第一个成员将自动成为管理员</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Member list */}
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className={`relative group w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                selectedId === m.id
                  ? "border-amber-500 bg-amber-50"
                  : "border-stone-200 bg-white hover:border-stone-300"
              }`}
              onClick={() => selectMember(m.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-medium">
                    {m.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-800">{m.name}</p>
                    <p className="text-xs text-stone-400">{m.role === "admin" ? "管理员" : "成员"}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleting(m.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="删除成员"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selectedId && detail && (
          <div className="md:col-span-2 space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-stone-100 rounded-lg p-1">
              {([
                ["plan", "今日计划"],
                ["routines", "周期习惯"],
                ["profile", "成员档案"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    tab === key ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Today's plan */}
            {tab === "plan" && (
              <div className="bg-white rounded-xl border border-stone-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-stone-500">
                    今日计划 · {detail.dayPlan.date}
                  </h3>
                  <span className="text-xs text-stone-400">{detail.dayPlan.items.length} 项</span>
                </div>

                {detail.dayPlan.items.length === 0 ? (
                  <p className="text-sm text-stone-400 py-6 text-center">今日无安排</p>
                ) : (
                  <div className="space-y-3">
                    {detail.dayPlan.items.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-stone-50">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          item.source === "routine" ? "bg-amber-400" : "bg-blue-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-800">{item.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.time && (
                              <span className="text-xs text-stone-500">{item.time}</span>
                            )}
                            {item.timeSlot && (
                              <span className="text-xs text-stone-400">{formatTimeSlot(item.timeSlot)}</span>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              item.source === "routine" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                            }`}>
                              {item.source === "routine" ? "周期" : "临时"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Routines */}
            {tab === "routines" && (
              <div className="space-y-4">
                {/* Weekly routines */}
                <div className="bg-white rounded-xl border border-stone-200 p-6">
                  <h3 className="text-sm font-medium text-stone-500 mb-4">
                    长期周计划 · {detail.routines.length} 项
                  </h3>

                  {detail.routines.length === 0 ? (
                    <div className="py-6 text-center space-y-3">
                      <p className="text-sm text-stone-400">暂无周期习惯</p>
                      {detail.profile && (
                        <button
                          onClick={generateRoutines}
                          disabled={generating}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                        >
                          {generating ? "AI 分析中..." : "从档案生成"}
                        </button>
                      )}
                      <p className="text-xs text-stone-400">也可以通过微信告诉管家你的生活习惯来创建</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detail.routines.map((routine) => (
                        <div key={routine.id} className="p-4 rounded-lg border border-stone-100 bg-stone-50">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-medium text-stone-800">{routine.title}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <div className="flex gap-1">
                                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                                    <span
                                      key={d}
                                      className={`w-6 h-6 rounded-full text-xs flex items-center justify-center ${
                                        routine.weekdays.includes(d)
                                          ? "bg-amber-500 text-white font-medium"
                                          : "bg-stone-200 text-stone-400"
                                      }`}
                                    >
                                      {WEEKDAY_NAMES[d]}
                                    </span>
                                  ))}
                                </div>
                                {routine.time && (
                                  <span className="text-xs text-stone-500">{routine.time}</span>
                                )}
                                {routine.timeSlot && (
                                  <span className="text-xs text-stone-400">{formatTimeSlot(routine.timeSlot)}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {routine.reminders.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {routine.reminders.map((r, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                                  ⏰ {r.offsetMinutes > 0 ? `提前${r.offsetMinutes}分钟` : "到时"}
                                  {r.message ? `: ${r.message}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Overrides */}
                {detail.overrides.length > 0 && (
                  <div className="bg-white rounded-xl border border-stone-200 p-6">
                    <h3 className="text-sm font-medium text-stone-500 mb-4">
                      临时变动 · {detail.overrides.length} 项
                    </h3>
                    <div className="space-y-2">
                      {detail.overrides.map((ovr) => {
                        const actionLabels: Record<string, { text: string; color: string }> = {
                          skip: { text: "跳过", color: "bg-red-50 text-red-600" },
                          add: { text: "新增", color: "bg-green-50 text-green-600" },
                          modify: { text: "修改", color: "bg-blue-50 text-blue-600" },
                        };
                        const a = actionLabels[ovr.action] ?? { text: ovr.action, color: "bg-stone-100 text-stone-500" };
                        return (
                          <div key={ovr.id} className="flex items-center gap-3 p-3 rounded-lg bg-stone-50">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${a.color}`}>{a.text}</span>
                            <div className="flex-1">
                              <p className="text-sm text-stone-700">{ovr.title ?? ovr.reason ?? ovr.routineId ?? "临时变动"}</p>
                              <p className="text-xs text-stone-400 mt-0.5">
                                {ovr.date ?? (ovr.dateRange ? `${ovr.dateRange.start} ~ ${ovr.dateRange.end}` : "")}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profile */}
            {tab === "profile" && (
              <div className="bg-white rounded-xl border border-stone-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-stone-500">成员档案</h3>
                  {!editing ? (
                    <button
                      onClick={startEditing}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                      编辑
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-500 hover:bg-stone-100 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveProfile}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors"
                      >
                        {saving ? "保存中..." : "保存"}
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-[500px] text-sm text-stone-700 font-mono leading-relaxed bg-stone-50 rounded-lg p-4 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                    spellCheck={false}
                  />
                ) : (
                  <pre className="text-sm text-stone-700 whitespace-pre-wrap font-mono leading-relaxed bg-stone-50 rounded-lg p-4 max-h-[600px] overflow-auto">
                    {detail.profile || "暂无档案，点击「编辑」开始填写"}
                  </pre>
                )}

                {!editing && detail.profile && (
                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <button
                      onClick={generateRoutines}
                      disabled={generating}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      {generating ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          AI 分析中...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          从档案生成周期习惯
                        </>
                      )}
                    </button>
                    <p className="text-xs text-stone-400 mt-1.5">
                      AI 将分析档案中描述的生活习惯，自动创建周期计划
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Routine preview dialog */}
      {showRoutinePreview && suggestedRoutines.length > 0 && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowRoutinePreview(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-stone-100">
              <h3 className="text-lg font-semibold text-stone-800">AI 识别的周期习惯</h3>
              <p className="text-sm text-stone-500 mt-1">
                共识别 {suggestedRoutines.length} 项习惯，请选择要添加的内容
              </p>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-3">
              {suggestedRoutines.map((routine, idx) => (
                <label
                  key={idx}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedRoutineIdx.has(idx)
                      ? "border-amber-300 bg-amber-50/50"
                      : "border-stone-200 bg-stone-50 opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedRoutineIdx.has(idx)}
                    onChange={() => toggleRoutine(idx)}
                    className="mt-0.5 rounded border-stone-300 text-amber-500 focus:ring-amber-500/20"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800">{routine.title}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                          <span
                            key={d}
                            className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${
                              routine.weekdays.includes(d)
                                ? "bg-amber-500 text-white font-medium"
                                : "bg-stone-200 text-stone-400"
                            }`}
                          >
                            {WEEKDAY_NAMES[d]}
                          </span>
                        ))}
                      </div>
                      {routine.time && <span className="text-xs text-stone-500">{routine.time}</span>}
                      {routine.timeSlot && <span className="text-xs text-stone-400">{formatTimeSlot(routine.timeSlot)}</span>}
                    </div>
                    {routine.reminders.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {routine.reminders.map((r, i) => (
                          <span key={i} className="text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            ⏰ {r.offsetMinutes > 0 ? `提前${r.offsetMinutes}分钟` : "到时"}{r.message ? `: ${r.message}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="p-6 border-t border-stone-100 flex items-center justify-between">
              <button
                onClick={() => {
                  if (selectedRoutineIdx.size === suggestedRoutines.length) {
                    setSelectedRoutineIdx(new Set());
                  } else {
                    setSelectedRoutineIdx(new Set(suggestedRoutines.map((_, i) => i)));
                  }
                }}
                className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
              >
                {selectedRoutineIdx.size === suggestedRoutines.length ? "取消全选" : "全选"}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRoutinePreview(false)}
                  className="px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={applySelectedRoutines}
                  disabled={selectedRoutineIdx.size === 0 || applyingRoutines}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {applyingRoutines ? "添加中..." : `添加 ${selectedRoutineIdx.size} 项习惯`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDeleting(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800 mb-2">确认删除</h3>
            <p className="text-sm text-stone-500 mb-6">
              确定要删除成员「{members.find((m) => m.id === deleting)?.name}」吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleting(null)}
                className="px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => deleteMember(deleting)}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
