
import React from 'react';
import { CalendarIcon, FilterIcon, RefreshIcon } from './icons';
import DateRangePicker from './DateRangePicker';

interface FiltersBarProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;

  rightSlot?: React.ReactNode;
  onReset?: () => void;
}

const FiltersBar: React.FC<FiltersBarProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  rightSlot,
  onReset,
}) => {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 backdrop-blur-xl shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      {/* premium glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(700px 280px at 15% 0%, rgba(99,102,241,0.12), transparent 60%),' +
            'radial-gradient(700px 280px at 85% 0%, rgba(34,211,238,0.10), transparent 60%)',
        }}
      />

      <div className="relative px-6 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Left: Date range */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">
            <CalendarIcon />
            Период анализа
          </div>

          <div className="flex items-center gap-2">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={onStartDateChange}
              onEndDateChange={onEndDateChange}
              className="!h-10 !rounded-2xl !bg-white/90 !border-slate-200 !shadow-sm focus-within:!ring-4 focus-within:!ring-indigo-500/10 focus-within:!border-indigo-300"
            />
          </div>

          {onReset && (
            <button
              onClick={onReset}
              className="ml-1 p-2 rounded-xl border border-slate-200 bg-slate-900/5 text-slate-600 hover:text-slate-900 hover:bg-slate-900/10 transition"
              title="Сбросить период"
            >
              <RefreshIcon small />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="hidden lg:block h-8 w-px bg-slate-200 mx-4" />

        {/* Middle: Filters label */}
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">
          <FilterIcon />
          Фильтры
        </div>

        {/* Right: external filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {rightSlot ?? (
            <span className="text-xs text-slate-400 italic">
              Дополнительные фильтры отсутствуют
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default FiltersBar;
