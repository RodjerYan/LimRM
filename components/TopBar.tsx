
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
          <div className="t-title">{title}</div>
          {subtitle && (
            <div className="text-xs text-slate-500 mt-1 truncate max-w-md">
              {subtitle}
            </div>
          )}
        </div>

        {/* Middle: Date range */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 t-label">
            <CalendarIcon />
            Период
          </div>

          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition outline-none"
          />
          <span className="text-slate-400 font-medium">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition outline-none"
          />

          {onResetDates && (
            <button
              onClick={onResetDates}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-900/5 text-slate-600 hover:bg-slate-900/10 transition"
              title="Сбросить"
            >
              <RefreshIcon small />
            </button>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-4 ml-auto overflow-x-auto max-w-full pb-1 xl:pb-0">
          {statusLabel && (
            <div className="flex items-center gap-2 h-9 px-3 rounded-2xl border border-slate-200 bg-slate-900/5 text-xs font-semibold text-slate-700 whitespace-nowrap">
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
