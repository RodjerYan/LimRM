
import React, { useEffect, useState } from "react";
import { SearchIcon } from "./icons";

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  onSelect: () => void;
}

interface GlobalSearchProps {
  items: SearchItem[];
  isOpen: boolean;
  onClose: () => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ items, isOpen, onClose }) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Reset query when closed
  useEffect(() => {
      if (!isOpen) setQuery("");
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = items.filter(
    (i) =>
      i.title.toLowerCase().includes(query.toLowerCase()) ||
      (i.subtitle && i.subtitle.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div className="relative flex items-start justify-center pt-[15vh] px-4">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] animate-fade-up overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
            <div className="text-slate-400">
                <SearchIcon />
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по клиентам, адресам, РМ, каналам…"
              className="w-full text-base font-bold text-slate-900 outline-none placeholder-slate-400"
            />
            <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">ESC</span>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {query ? "Ничего не найдено" : "Начните вводить текст для поиска..."}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((item) => (
                    <button
                    key={item.id}
                    onClick={() => {
                        item.onSelect();
                        onClose();
                    }}
                    className="w-full text-left px-5 py-3 hover:bg-indigo-50/50 transition-colors group"
                    >
                    <div className="font-black text-slate-900 group-hover:text-indigo-700 transition-colors">{item.title}</div>
                    {item.subtitle && (
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {item.subtitle}
                        </div>
                    )}
                    </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="bg-slate-50 px-5 py-2 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>Global Search</span>
              <span>{filtered.length} results</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
