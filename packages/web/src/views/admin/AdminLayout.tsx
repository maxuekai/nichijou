import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/admin", label: "概览", end: true },
  { to: "/admin/members", label: "成员" },
  { to: "/admin/soul", label: "人格" },
  { to: "/admin/wechat", label: "微信" },
  { to: "/admin/chat", label: "对话" },
  { to: "/admin/logs", label: "日志" },
  { to: "/admin/status", label: "状态" },
  { to: "/board", label: "看板" },
];

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-stone-800">Nichijou Loop</span>
            <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded">管理</span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-amber-50 text-amber-700 font-medium"
                      : "text-stone-600 hover:text-stone-800 hover:bg-stone-50"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
