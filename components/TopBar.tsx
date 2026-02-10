
import React from "react";
import { CalendarIcon, RefreshIcon, SuccessIcon, LoaderIcon } from "./icons";

interface TopBarProps {
  title: string;
  subtitle?: string;

  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onResetDates?: () => void;

  isLoading?: boolean;
  statusLabel?: string;
  rightSlot?: React.ReactNode;
}

const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onResetDates,
  isLoading,
  statusLabel,
  rightSlot,
}) => {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 backdrop-blur-xl shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      {/* glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 420px at 15% 0%, rgba(99,102,241,0.14), transparent 60%)," +
            "radial-gradient(900px 420px at 85% 0%, rgba(34,211,238,0.12), transparent 60%)",
        }}
      />

      <div className="relative px-6 py-5 flex flex-col xl:flex-row xl:items-center gap-5">
        {/* Left */}
        <div className="min-w-0">
          <div className="text-2xl font-black text-slate-900 truncate">{title}</div>
          {subtitle && (
            <div className="text-sm text-slate-500 mt-1 truncate">
              {subtitle}
            </div>
          )}
        </div>

        {/* Middle: Date range */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">
            <CalendarIcon />
            Период
          </div>

          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300"
          />
          <span className="text-slate-400 font-black">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300"
          />

          {onResetDates && (
            <button
              onClick={onResetDates}
              className="p-2 rounded-xl border border-slate-200 bg-slate-900/5 text-slate-600 hover:bg-slate-900/10"
              title="Сбросить"
            >
              <RefreshIcon small />
            </button>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-4 ml-auto">
          {statusLabel && (
            <div className="flex items-center gap-2 text-xs font-black text-slate-700 bg-slate-900/5 border border-slate-200 px-3 py-1.5 rounded-2xl">
              {isLoading ? (
                <LoaderIcon className="w-3 h-3 animate-spin" />
              ) : (
                <SuccessIcon className="w-3 h-3 text-emerald-600" />
              )}
              {statusLabel}
            </div>
          )}

          {rightSlot}
        </div>
      </div>
    </div>
  );
};

export default TopBar;
