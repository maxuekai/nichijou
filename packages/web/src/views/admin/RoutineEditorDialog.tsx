const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

export interface RoutineAction {
  id: string;
  type: "notify" | "plugin" | "ai_task";
  trigger: "before" | "at" | "after";
  offsetMinutes: number;
  channel?: string;
  message?: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  prompt?: string;
}

export interface Routine {
  id: string;
  title: string;
  description?: string;
  assigneeMemberIds?: string[];
  weekdays: number[];
  timeSlot?: string;
  time?: string;
  reminders?: Array<{ offsetMinutes: number; message: string; channel: string }>;
  actions?: RoutineAction[];
}

export interface RoutineMemberOption {
  id: string;
  name: string;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function defaultTimeForSlot(slot?: string): string | undefined {
  const defaults: Record<string, string> = { morning: "08:00", afternoon: "14:00", evening: "20:00" };
  return slot ? defaults[slot] : undefined;
}

export function getScheduledAiPrompt(routine: Routine): string {
  const aiTask = routine.actions?.find((action) => action.type === "ai_task");
  if (!aiTask) return "";
  return asText(aiTask.prompt ?? routine.description ?? routine.title);
}

export function getScheduledNotifyMessage(routine: Routine): string {
  const notify = routine.actions?.find((action) => action.type === "notify");
  return asText(notify?.message ?? routine.reminders?.[0]?.message ?? "{{result}}");
}

export function upsertRoutineActionDraft(
  routine: Routine,
  action: Partial<RoutineAction> & Pick<RoutineAction, "type">,
): Routine {
  const actions = [...(routine.actions ?? [])];
  const existingIndex = actions.findIndex((item) => item.type === action.type);
  const existing = existingIndex >= 0 ? actions[existingIndex] : undefined;
  const nextAction: RoutineAction = {
    id: existing?.id ?? `${routine.id}_${action.type}`,
    trigger: action.type === "notify" ? "after" : "at",
    offsetMinutes: 0,
    channel: "wechat",
    ...existing,
    ...action,
  };

  if (existingIndex >= 0) {
    actions[existingIndex] = nextAction;
  } else {
    actions.push(nextAction);
  }

  return { ...routine, actions };
}

export function normalizeRoutineForScheduledActions(
  routine: Routine,
  options?: { seedAiTaskFromFallback?: boolean },
): Routine {
  const title = routine.title.trim() || "新习惯";
  const prompt = getScheduledAiPrompt(routine).trim()
    || (options?.seedAiTaskFromFallback ? asText(routine.description ?? routine.title).trim() : "");
  const hasAiTask = prompt.length > 0;
  const notifyMessage = getScheduledNotifyMessage(routine).trim() || (hasAiTask ? "{{result}}" : title);
  const actionPrefix = routine.id || `rtn_${Date.now().toString(36)}`;
  const notifyAction: RoutineAction = {
    id: `${actionPrefix}_notify`,
    type: "notify",
    trigger: hasAiTask ? "after" : "at",
    offsetMinutes: 0,
    channel: "wechat",
    message: notifyMessage,
  };

  return {
    id: routine.id || actionPrefix,
    title,
    description: prompt || title,
    assigneeMemberIds: routine.assigneeMemberIds,
    weekdays: [...routine.weekdays].sort((a, b) => a - b),
    time: routine.time ?? defaultTimeForSlot(routine.timeSlot),
    reminders: [{
      offsetMinutes: 0,
      message: notifyMessage,
      channel: "wechat",
    }],
    actions: hasAiTask
      ? [
        {
          id: `${actionPrefix}_ai_task`,
          type: "ai_task",
          trigger: "at",
          offsetMinutes: 0,
          channel: "wechat",
          prompt,
        },
        notifyAction,
      ]
      : [notifyAction],
  };
}

interface RoutineEditorDialogProps {
  routine: Routine;
  title: string;
  memberOptions?: RoutineMemberOption[];
  requireAssignees?: boolean;
  onChange: (routine: Routine) => void;
  onCancel: () => void;
  onSave: (routine: Routine) => void | Promise<void>;
}

export function RoutineEditorDialog({
  routine,
  title,
  memberOptions = [],
  requireAssignees = false,
  onChange,
  onCancel,
  onSave,
}: RoutineEditorDialogProps) {
  const allMemberIds = memberOptions.map((member) => member.id);
  const selectedMemberIds = memberOptions.length === 0
    ? []
    : (routine.assigneeMemberIds && routine.assigneeMemberIds.length > 0
      ? routine.assigneeMemberIds.filter((id) => allMemberIds.includes(id))
      : allMemberIds);
  const saveDisabled = !routine.title.trim()
    || !getScheduledNotifyMessage(routine).trim()
    || routine.weekdays.length === 0
    || !routine.time
    || (requireAssignees && selectedMemberIds.length === 0);

  function setSelectedMemberIds(nextIds: string[]) {
    const ordered = allMemberIds.filter((id) => nextIds.includes(id));
    onChange({ ...routine, assigneeMemberIds: ordered });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-stone-800 mb-4">{title}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">名称</label>
            <input
              type="text"
              value={routine.title}
              onChange={(e) => {
                const nextTitle = e.target.value;
                const currentPrompt = getScheduledAiPrompt(routine);
                const nextRoutine = { ...routine, title: nextTitle };
                onChange(
                  currentPrompt === routine.title
                    ? upsertRoutineActionDraft(nextRoutine, {
                        type: "ai_task",
                        trigger: "at",
                        offsetMinutes: 0,
                        channel: "wechat",
                        prompt: nextTitle,
                      })
                    : nextRoutine,
                );
              }}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">AI 任务内容（可选）</label>
            <textarea
              value={getScheduledAiPrompt(routine)}
              onChange={(e) => {
                onChange(upsertRoutineActionDraft(routine, {
                  type: "ai_task",
                  trigger: "at",
                  offsetMinutes: 0,
                  channel: "wechat",
                  prompt: e.target.value,
                }));
              }}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">微信通知内容</label>
            <textarea
              value={getScheduledNotifyMessage(routine)}
              onChange={(e) => {
                onChange(upsertRoutineActionDraft(routine, {
                  type: "notify",
                  trigger: "after",
                  offsetMinutes: 0,
                  channel: "wechat",
                  message: e.target.value,
                }));
              }}
              rows={2}
              placeholder="{{result}}"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
            />
          </div>

          {memberOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-2">适用成员</label>
              <div className="grid grid-cols-2 gap-2">
                {memberOptions.map((member) => {
                  const checked = selectedMemberIds.includes(member.id);
                  return (
                    <label key={member.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                      checked
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
                    }`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedMemberIds(
                            e.target.checked
                              ? [...selectedMemberIds, member.id]
                              : selectedMemberIds.filter((id) => id !== member.id),
                          );
                        }}
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span className="truncate">{member.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">每周重复</label>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    const wds = routine.weekdays.includes(d)
                      ? routine.weekdays.filter((x) => x !== d)
                      : [...routine.weekdays, d].sort((a, b) => a - b);
                    onChange({ ...routine, weekdays: wds });
                  }}
                  className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                    routine.weekdays.includes(d)
                      ? "bg-amber-500 text-white"
                      : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                  }`}
                >
                  {WEEKDAY_NAMES[d]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">具体时间</label>
            <input
              type="time"
              value={routine.time ?? ""}
              onChange={(e) => onChange({ ...routine, time: e.target.value || undefined })}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:bg-white transition-all [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              required
            />
          </div>

          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <p className="text-xs text-stone-500">
              留空 AI 任务内容时只发送微信通知，不执行 AI。通知内容可使用 {"{{result}}"} 引用 AI 任务返回内容。
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={() => { void onSave(routine); }}
            disabled={saveDisabled}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors cursor-pointer"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
