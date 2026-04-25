import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import {
  RoutineEditorDialog,
  defaultTimeForSlot,
  normalizeRoutineForScheduledActions,
  type Routine,
} from "./RoutineEditorDialog";

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

type FamilyRoutine = Routine;

interface FamilyPlan {
  id: string;
  title?: string;
  description?: string;
  action: "skip" | "add" | "modify";
  assigneeMemberIds?: string[];
  date?: string;
  dateRange?: { start: string; end: string };
  startTime?: string;
  endTime?: string;
  time?: string;
  reason?: string;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function FamilyPage() {
  const [family, setFamily] = useState<{ id: string; name: string; avatar?: string; homeCity?: string; homeAdcode?: string } | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [savingFamily, setSavingFamily] = useState(false);
  const [editingFamilyInfo, setEditingFamilyInfo] = useState(false);
  const [familyNameDraft, setFamilyNameDraft] = useState("");
  const [homeCityDraft, setHomeCityDraft] = useState("");
  const [homeAdcodeDraft, setHomeAdcodeDraft] = useState("");
  const [familyAvatarFile, setFamilyAvatarFile] = useState<File | null>(null);
  const [familyAvatarPreview, setFamilyAvatarPreview] = useState<string | null>(null);

  const [data, setData] = useState<{ routines: FamilyRoutine[]; plans: FamilyPlan[] }>({ routines: [], plans: [] });
  const [editingRoutine, setEditingRoutine] = useState<FamilyRoutine | null>(null);
  const [editingPlan, setEditingPlan] = useState<FamilyPlan | null>(null);

  const [planParsing, setPlanParsing] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setPageError(null);
        await Promise.all([loadFamily(), loadData()]);
      } catch (err) {
        setPageError(err instanceof Error ? err.message : "家庭数据加载失败");
      }
    })();
  }, []);

  async function loadFamily() {
    const res = await api.getFamily();
    setFamily(res.family);
    setMembers(res.members.map((m) => ({ id: m.id, name: m.name })));
  }

  async function loadData() {
    const res = await api.getFamilyPlans();
    setData({
      routines: res.routines as unknown as FamilyRoutine[],
      plans: (res.plans ?? res.overrides ?? []) as unknown as FamilyPlan[],
    });
  }

  function formatAssignees(ids?: string[]): string {
    if (!ids || ids.length === 0 || ids.length === members.length) return "@all";
    return ids.map((id) => `@${members.find((m) => m.id === id)?.name ?? id}`).join(" ");
  }

  function parseAssigneesFromText(input?: string): string[] {
    const text = asText(input).trim().replace(/，/g, ",");
    if (!text || text.includes("@all")) return members.map((m) => m.id);
    const names = text.match(/@([^\s,]+)/g)?.map((token) => token.slice(1)) ?? [];
    const ids = members.filter((m) => names.includes(m.name) || names.includes(m.id)).map((m) => m.id);
    return ids.length > 0 ? ids : members.map((m) => m.id);
  }

  const mentionCandidates = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [members, mentionQuery]);

  function updateMentionState(text: string, cursor: number) {
    const left = text.slice(0, cursor);
    const match = left.match(/(^|\s)@([^\s@]*)$/);
    if (!match) {
      setMentionOpen(false);
      setMentionStart(null);
      setMentionQuery("");
      return;
    }
    setMentionOpen(true);
    setMentionStart(left.lastIndexOf("@"));
    setMentionQuery(match[2] ?? "");
  }

  function applyMention(memberName: string) {
    if (mentionStart == null) return;
    if (editingPlan) {
      const source = editingPlan.description ?? "";
      const next = `${source.slice(0, mentionStart)}@${memberName} ${source.slice((mentionStart + 1) + mentionQuery.length)}`;
      setEditingPlan({ ...editingPlan, description: next, assigneeMemberIds: parseAssigneesFromText(next) });
    }
    setMentionOpen(false);
    setMentionStart(null);
    setMentionQuery("");
  }

  async function parsePlanWithAI() {
    if (!editingPlan) return;
    const description = asText(editingPlan.description);
    if (!description.trim() || planParsing || members.length === 0) return;
    setPlanParsing(true);
    setAiWarnings([]);
    setParseError(null);
    try {
      const res = await api.parsePlan(members[0]!.id, description.trim());
      if (!res.ok || !res.plan) {
        setParseError(res.error ?? "AI 解析失败");
        return;
      }
      const parsed = res.plan as unknown as FamilyPlan;
      setEditingPlan({
        ...parsed,
        id: editingPlan.id,
        description,
        assigneeMemberIds: parseAssigneesFromText(description),
      });
      setAiWarnings(res.warnings ?? []);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "AI 解析失败");
    } finally {
      setPlanParsing(false);
    }
  }

  async function saveFamilyRoutine(routine: FamilyRoutine) {
    try {
      setPageError(null);
      const assigneeMemberIds = routine.assigneeMemberIds && routine.assigneeMemberIds.length > 0
        ? routine.assigneeMemberIds
        : members.map((m) => m.id);
      const normalizedRoutine = normalizeRoutineForScheduledActions({ ...routine, assigneeMemberIds });
      await api.upsertFamilyRoutine(routine.id, normalizedRoutine as unknown as Record<string, unknown>);
      setEditingRoutine(null);
      await loadData();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "保存家庭习惯失败");
    }
  }

  function openFamilyEditDialog() {
    setFamilyNameDraft(family?.name ?? "");
    setHomeCityDraft(family?.homeCity ?? "");
    setHomeAdcodeDraft(family?.homeAdcode ?? "");
    setFamilyAvatarFile(null);
    setFamilyAvatarPreview(family?.avatar ? api.avatarUrl(family.avatar) : null);
    setEditingFamilyInfo(true);
  }

  async function saveFamilyInfo() {
    const nextName = familyNameDraft.trim();
    if (!nextName) return;
    setSavingFamily(true);
    try {
      setPageError(null);
      if (familyAvatarFile) {
        await api.uploadFamilyAvatar(familyAvatarFile);
      }
      await api.updateFamily({
        name: nextName,
        homeCity: homeCityDraft.trim() || undefined,
        homeAdcode: homeAdcodeDraft.trim() || undefined,
      });
      await loadFamily();
      setEditingFamilyInfo(false);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "保存家庭信息失败");
    } finally {
      setSavingFamily(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">家庭</h1>
      {pageError && <p className="text-sm text-red-600">{pageError}</p>}

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h3 className="text-sm font-medium text-stone-500 mb-4">家庭信息</h3>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {family?.avatar ? (
              <img src={api.avatarUrl(family.avatar)} alt={family.name} className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold">{(family?.name ?? "家").charAt(0)}</div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-stone-800 truncate">{family?.name ?? "未设置家庭名称"}</p>
              <p className="text-xs text-stone-400 mt-0.5">{members.length} 位成员 · 常居地 {family?.homeAdcode ?? family?.homeCity ?? "未设置"}</p>
            </div>
          </div>
          <button
            onClick={openFamilyEditDialog}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            编辑
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-stone-500">家庭习惯 · {data.routines.length} 项</h3>
          <button onClick={() => {
            const newRoutine: FamilyRoutine = {
              id: `rtn_${Date.now().toString(36)}`,
              title: "新习惯",
              description: "新习惯",
              weekdays: [0, 1, 2, 3, 4, 5, 6],
              time: "09:00",
              reminders: [],
              actions: [],
              assigneeMemberIds: members.map((m) => m.id),
            };
            setEditingRoutine(normalizeRoutineForScheduledActions(newRoutine, { seedAiTaskFromFallback: true }));
          }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100">+ 新增家庭习惯</button>
        </div>
        <div className="space-y-2">
          {data.routines.map((r) => (
            <div key={r.id} className="p-3 rounded-lg bg-stone-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-800">{r.title}</p>
                <p className="text-xs text-stone-500 mt-0.5">{formatAssignees(r.assigneeMemberIds)} · {r.weekdays.map((d) => `周${WEEKDAY_NAMES[d]}`).join("、")}{r.time ? ` · ${r.time}` : ""}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => {
                  setEditingRoutine(normalizeRoutineForScheduledActions({
                    ...r,
                    title: asText(r.title) || "新习惯",
                    description: asText(r.description),
                    time: r.time ?? defaultTimeForSlot(r.timeSlot) ?? "09:00",
                    reminders: r.reminders ?? [],
                  }));
                }} className="px-2 py-1 text-xs rounded border border-stone-300 text-stone-600 hover:bg-stone-100">编辑</button>
                <button onClick={async () => {
                  try {
                    setPageError(null);
                    await api.deleteFamilyRoutine(r.id);
                    await loadData();
                  } catch (err) {
                    setPageError(err instanceof Error ? err.message : "删除家庭习惯失败");
                  }
                }} className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50">删除</button>
              </div>
            </div>
          ))}
          {data.routines.length === 0 && <p className="text-sm text-stone-400 py-4 text-center">暂无家庭习惯</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-stone-500">家庭计划 · {data.plans.length} 项</h3>
          <button onClick={() => {
            setParseError(null);
            setAiWarnings([]);
            setEditingPlan({ id: `pln_${Date.now().toString(36)}`, action: "add", description: "", assigneeMemberIds: members.map((m) => m.id) });
          }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100">+ 新增家庭计划</button>
        </div>
        <div className="space-y-2">
          {data.plans.map((p) => (
            <div key={p.id} className="p-3 rounded-lg bg-stone-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-800">{p.title ?? "家庭计划"}</p>
                <p className="text-xs text-stone-500 mt-0.5">{formatAssignees(p.assigneeMemberIds)} · {p.action}{p.date ? ` · ${p.date}` : ""}{p.startTime ? ` · ${p.startTime}` : ""}{p.endTime ? `-${p.endTime}` : ""}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setParseError(null); setAiWarnings([]); setEditingPlan({ ...p, description: asText(p.description) || `${p.title ?? "家庭计划"} ${formatAssignees(p.assigneeMemberIds)}` }); }} className="px-2 py-1 text-xs rounded border border-stone-300 text-stone-600 hover:bg-stone-100">编辑</button>
                <button onClick={async () => {
                  try {
                    setPageError(null);
                    await api.deleteFamilyPlan(p.id);
                    await loadData();
                  } catch (err) {
                    setPageError(err instanceof Error ? err.message : "删除家庭计划失败");
                  }
                }} className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50">删除</button>
              </div>
            </div>
          ))}
          {data.plans.length === 0 && <p className="text-sm text-stone-400 py-4 text-center">暂无家庭计划</p>}
        </div>
      </div>

      {editingRoutine && (
        <RoutineEditorDialog
          routine={editingRoutine}
          title={data.routines.some((r) => r.id === editingRoutine.id) ? "编辑家庭习惯" : "新增家庭习惯"}
          memberOptions={members}
          requireAssignees
          onChange={setEditingRoutine}
          onCancel={() => setEditingRoutine(null)}
          onSave={saveFamilyRoutine}
        />
      )}

      {editingPlan && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingPlan(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800 mb-3">家庭计划（自然语言）</h3>
            <div className="relative">
              <textarea
                value={asText(editingPlan.description)}
                onChange={(e) => {
                  const text = e.target.value;
                  setEditingPlan({ ...editingPlan, description: text, assigneeMemberIds: parseAssigneesFromText(text) });
                  updateMentionState(text, e.target.selectionStart ?? text.length);
                }}
                onClick={(e) => updateMentionState((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                onKeyUp={(e) => updateMentionState((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="例如：明天 14:00-18:00 @妈妈 复查，其他习惯暂停"
              />
              {mentionOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg max-h-40 overflow-auto">
                  {mentionCandidates.map((m) => <button key={m.id} onClick={() => applyMention(m.name)} className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50">@{m.name}</button>)}
                  <button onClick={() => applyMention("all")} className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 text-amber-700">@all</button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-stone-400">仅需输入描述；AI 会生成计划类型、日期与时间段</p>
              <button onClick={parsePlanWithAI} disabled={!asText(editingPlan.description).trim() || planParsing} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50">{planParsing ? "AI 解析中…" : "AI 解析"}</button>
            </div>
            {parseError && <p className="text-xs text-red-500 mt-1">{parseError}</p>}
            {aiWarnings.length > 0 && <div className="mt-2 p-2 rounded bg-yellow-50 border border-yellow-200">{aiWarnings.map((w, i) => <p key={i} className="text-xs text-yellow-700">{w}</p>)}</div>}
            {editingPlan.title && (
              <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200">
                <p className="text-sm font-medium text-stone-800">{editingPlan.title}</p>
                <p className="text-xs text-stone-500 mt-1">{editingPlan.action} · {formatAssignees(editingPlan.assigneeMemberIds)} · {editingPlan.date ?? (editingPlan.dateRange ? `${editingPlan.dateRange.start}~${editingPlan.dateRange.end}` : "")}{editingPlan.startTime ? ` ${editingPlan.startTime}` : ""}{editingPlan.endTime ? `-${editingPlan.endTime}` : ""}</p>
              </div>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditingPlan(null)} className="px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100">取消</button>
              <button onClick={async () => {
                try {
                  setPageError(null);
                  await api.upsertFamilyPlan(editingPlan.id, { ...editingPlan, assigneeMemberIds: parseAssigneesFromText(asText(editingPlan.description)) });
                  setEditingPlan(null);
                  await loadData();
                } catch (err) {
                  setPageError(err instanceof Error ? err.message : "保存家庭计划失败");
                }
              }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">保存</button>
            </div>
          </div>
        </div>
      )}

      {editingFamilyInfo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingFamilyInfo(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800 mb-4">编辑家庭信息</h3>
            <div className="space-y-4">
              <div className="flex justify-center">
                <label className="relative cursor-pointer group">
                  {familyAvatarPreview ? (
                    <img src={familyAvatarPreview} alt={familyNameDraft || "家庭"} className="w-20 h-20 rounded-full object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-2xl font-medium">
                      {(familyNameDraft || "家").charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">
                    更换头像
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setFamilyAvatarFile(file);
                      setFamilyAvatarPreview(URL.createObjectURL(file));
                    }}
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">家庭名称</label>
                <input
                  type="text"
                  value={familyNameDraft}
                  onChange={(e) => setFamilyNameDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">常居城市</label>
                <input
                  type="text"
                  value={homeCityDraft}
                  onChange={(e) => setHomeCityDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="例如：深圳"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">行政区编码（可选）</label>
                <input
                  type="text"
                  value={homeAdcodeDraft}
                  onChange={(e) => setHomeAdcodeDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="例如：440300"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingFamilyInfo(false)}
                className="px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveFamilyInfo}
                disabled={savingFamily || !familyNameDraft.trim()}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {savingFamily ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
