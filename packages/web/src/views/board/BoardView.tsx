import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

interface DayPlanItem {
  title: string;
  timeSlot?: string;
}

interface MemberData {
  id: string;
  name: string;
  role: string;
  plan: DayPlanItem[];
}

const TIME_LABELS: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

export function BoardView() {
  const [familyName, setFamilyName] = useState("家庭看板");
  const [members, setMembers] = useState<MemberData[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    loadData();
    const timer = setInterval(() => setNow(new Date()), 60000);
    const refresh = setInterval(loadData, 300000);
    return () => { clearInterval(timer); clearInterval(refresh); };
  }, []);

  async function loadData() {
    const familyData = await api.getFamily();
    setFamilyName(familyData.family?.name ?? "家庭看板");

    const memberPlans: MemberData[] = [];
    for (const m of familyData.members) {
      try {
        const plan = await api.getDayPlan(m.id);
        memberPlans.push({ ...m, plan: plan.items });
      } catch {
        memberPlans.push({ ...m, plan: [] });
      }
    }
    setMembers(memberPlans);
  }

  const weekday = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 星期${weekday}`;
  const timeStr = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold">{familyName}</h1>
          <p className="text-stone-400 mt-1">{dateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-light tabular-nums">{timeStr}</p>
          <Link to="/admin" className="text-xs text-stone-500 hover:text-stone-400 mt-1 inline-block">
            管理
          </Link>
        </div>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((m) => (
          <div key={m.id} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-lg font-semibold">
                {m.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-lg">{m.name}</p>
                <p className="text-xs text-stone-500">{m.role === "admin" ? "管理员" : "成员"}</p>
              </div>
            </div>

            {m.plan.length === 0 ? (
              <p className="text-stone-500 text-sm py-4 text-center">今日暂无安排</p>
            ) : (
              <div className="space-y-3">
                {m.plan.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-amber-400 shrink-0" />
                    <div>
                      <p className="text-sm text-stone-200">{item.title}</p>
                      {item.timeSlot && (
                        <p className="text-xs text-stone-500 mt-0.5">{TIME_LABELS[item.timeSlot] ?? item.timeSlot}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {members.length === 0 && (
          <div className="col-span-full text-center py-20 text-stone-500">
            <p className="text-lg">暂无成员</p>
            <p className="text-sm mt-2">请在管理页面添加家庭成员</p>
          </div>
        )}
      </div>
    </div>
  );
}
