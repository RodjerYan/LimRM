
import React, { useState } from "react";
import { SaveIcon } from "./icons";

interface ViewState {
  id: string;
  name: string;
  payload: any;
}

const STORAGE_KEY = "limrm_saved_views";

export default function SavedViews({
  currentState,
  onApply,
}: {
  currentState: any;
  onApply: (state: any) => void;
}) {
  const [views, setViews] = useState<ViewState[]>(() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch (e) {
          return [];
      }
  });

  const saveView = () => {
    const name = prompt("Название пресета (например: 'Q1 2025 - Юг'):");
    if (!name) return;
    const next = [
      ...views,
      { id: Date.now().toString(), name, payload: currentState },
    ];
    setViews(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={saveView}
        className="flex items-center gap-2 h-9 px-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 font-bold text-xs transition-all shadow-sm active:scale-95 whitespace-nowrap"
        title="Сохранить текущие фильтры как пресет"
      >
        <SaveIcon small />
        <span>Сохранить</span>
      </button>

      <select
        onChange={(e) => {
          const view = views.find((v) => v.id === e.target.value);
          if (view) onApply(view.payload);
          e.target.value = ""; // Reset selection
        }}
        className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer hover:border-slate-300 transition-colors max-w-[140px]"
      >
        <option value="">Загрузить вид…</option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  );
}
