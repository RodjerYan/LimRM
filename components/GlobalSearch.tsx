
import React, { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "./icons";
import { SearchItem } from "./search/useSearchEverywhereItems";
import { getRecent, pushRecent } from "./search/recent";

interface GlobalSearchProps {
  items: SearchItem[];
  isOpen: boolean;
  onClose: () => void;
}

function useDebounce<T>(value: T, delay = 120) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ items, isOpen, onClose }) => {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query);
  const [recent, setRecent] = useState<SearchItem[]>([]);

  useEffect(() => {
    if (isOpen) {
        setQuery("");
        setRecent(getRecent());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = useMemo(() => {
    if (!debounced.trim()) return [];
    const q = debounced.toLowerCase();
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.subtitle?.toLowerCase().includes(q)
    );
  }, [items, debounced]);

  const grouped = useMemo(() => {
    const map: Record<string, SearchItem[]> = {};
    const listToGroup = debounced.trim() ? filtered : recent;

    listToGroup.forEach((i) => {
      const section = debounced.trim() ? i.section : "Недавние";
      if (!map[section]) map[section] = [];
      map[section].push(i);
    });

    // If empty query and no recent items, show suggestions (Navigation)
    if (!debounced.trim() && recent.length === 0) {
        const navItems = items.filter(i => i.section === "Навигация");
        if (navItems.length > 0) {
             map["Рекомендуемое"] = navItems;
        }
    }

    return map;
  }, [filtered, recent, debounced, items]);

  const handleSelect = (item: SearchItem) => {
      pushRecent(item);
      item.onSelect();
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[3000]">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-md" onClick={onClose} />

      <div className="relative flex justify-center pt-[12vh] px-4">
        <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] animate-fade-up overflow-hidden">
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
          <div className="max-h-[55vh] overflow-y-auto custom-scrollbar">
            {Object.keys(grouped).length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                 {query ? "Ничего не найдено" : "Начните вводить текст..."}
              </div>
            ) : (
               Object.entries(grouped).map(([section, list]) => (
                <div key={section} className="py-2">
                  <div className="px-5 py-2 text-[11px] uppercase tracking-widest text-slate-400 font-black bg-slate-50/50">
                    {section}
                  </div>
                  {list.slice(0, 20).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className="w-full text-left px-5 py-3 hover:bg-indigo-50/50 transition-colors group border-b border-slate-50 last:border-0"
                    >
                      <div className="font-black text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-500 mt-1 truncate group-hover:text-slate-600">
                          {item.subtitle}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          
          <div className="bg-slate-50 px-5 py-2 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>Global Search</span>
              <span>{debounced ? filtered.length : Object.values(grouped).flat().length} results</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
