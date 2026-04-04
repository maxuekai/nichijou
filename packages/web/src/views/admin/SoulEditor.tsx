import { useEffect, useState } from "react";
import { api } from "../../api";

export function SoulEditor() {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSoul().then((data) => setContent(data.content));
  }, []);

  async function save() {
    await api.updateSoul(content);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">管家人格</h1>
          <p className="text-sm text-stone-500 mt-1">编辑 SOUL.md — 定义管家的性格、语气和偏好</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">已保存</span>}
          <button
            onClick={save}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            保存
          </button>
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={24}
        className="w-full px-6 py-4 rounded-xl border border-stone-200 bg-white text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
      />
    </div>
  );
}
