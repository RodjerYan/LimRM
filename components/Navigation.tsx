
import React from 'react';
import { DataIcon, AnalyticsIcon, ProphetIcon, LabIcon, BrainIcon, TargetIcon } from './icons';
import { useAuth } from './auth/AuthContext';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { id: 'adapta', label: 'ADAPTA (Данные)', icon: <DataIcon small /> },
    { id: 'amp', label: 'AMP (Аналитика)', icon: <AnalyticsIcon small /> },
    { id: 'dashboard', label: 'Дашборд План/Факт', icon: <TargetIcon small /> },
    { id: 'prophet', label: 'PROPHET (Прогноз)', icon: <ProphetIcon small /> },
    { id: 'agile', label: 'AGILE LEARNING', icon: <LabIcon small /> },
  ];

  if (isAdmin) {
    navItems.push({ id: 'roi-genome', label: 'ROI GENOME', icon: <BrainIcon small /> });
  }

  return (
    <nav className="hidden lg:flex fixed left-0 top-0 z-50 h-screen w-64 border-r border-slate-200/70 bg-white/70 backdrop-blur-xl">
      {/* soft premium glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(900px 520px at 20% 10%, rgba(99,102,241,0.14), transparent 60%),' +
            'radial-gradient(700px 420px at 70% 25%, rgba(34,211,238,0.12), transparent 60%),' +
            'radial-gradient(850px 520px at 40% 92%, rgba(163,230,53,0.10), transparent 60%)',
        }}
      />

      <div className="relative flex h-full w-full flex-col">
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-2xl overflow-hidden shadow-[0_16px_40px_rgba(99,102,241,0.18)] border border-slate-200/60">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-sky-500" />
              <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.9),transparent_55%)]" />
              <div className="relative h-full w-full flex items-center justify-center text-white font-black">
                L
              </div>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 tracking-tight leading-tight">
                LimRM Group
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-[0.18em]">
                Analytics Core
              </div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-5 space-y-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={[
                  "group w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all duration-200",
                  "border",
                  isActive
                    ? "bg-gradient-to-r from-indigo-600/10 to-sky-500/10 border-indigo-200/60 shadow-[0_14px_40px_rgba(99,102,241,0.14)]"
                    : "bg-white/60 border-slate-200/70 hover:bg-white/80 hover:shadow-[0_12px_30px_rgba(15,23,42,0.06)]",
                ].join(" ")}
              >
                {/* Icon bubble */}
                <span
                  className={[
                    "flex items-center justify-center w-10 h-10 rounded-2xl border transition-all",
                    isActive
                      ? "bg-gradient-to-br from-indigo-600 to-sky-500 text-white border-white/40 shadow-[0_14px_30px_rgba(34,211,238,0.18)]"
                      : "bg-slate-900/5 text-slate-600 border-slate-200 group-hover:bg-slate-900/7",
                  ].join(" ")}
                >
                  {item.icon}
                </span>

                <div className="min-w-0">
                  <div className={isActive ? "text-sm font-extrabold text-slate-900" : "text-sm font-bold text-slate-800"}>
                    {item.label}
                  </div>
                  <div className={isActive ? "text-[11px] text-indigo-700/70" : "text-[11px] text-slate-500"}>
                    Открыть модуль
                  </div>
                </div>

                {/* Right hint */}
                <span
                  className={[
                    "ml-auto text-[10px] font-black tracking-widest px-2 py-1 rounded-xl border transition-all",
                    isActive
                      ? "bg-white/70 text-indigo-700 border-indigo-200/60"
                      : "bg-transparent text-slate-400 border-transparent group-hover:bg-slate-900/5 group-hover:border-slate-200",
                  ].join(" ")}
                >
                  ↵
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-slate-200/60">
          <div className="rounded-2xl border border-slate-200/70 bg-white/60 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold text-slate-800">Premium Light</div>
              <div className="text-[10px] font-black text-slate-500 bg-slate-900/5 border border-slate-200 rounded-xl px-2 py-1">
                v2.5.0
              </div>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Современный UI слой без изменений логики
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;