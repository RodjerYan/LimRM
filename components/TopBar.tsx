
import React from "react";
import { CheckIcon, CalendarIcon, CloudDownloadIcon } from "./icons";

interface TopBarProps {
  title: string;
  subtitle?: string;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onSave?: () => void;
  onCloudSync?: () => void;
  isLoading?: boolean;
  extraControls?: React.ReactNode; // New prop for custom controls
}

const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSave,
  onCloudSync,
  isLoading,
  extraControls
}) => {
  return (
    <div className="w-full bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-3xl px-6 py-4 shadow-sm">
      
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

        {/* LEFT BLOCK */}
        <div className="flex flex-col min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 truncate">
            {title}
          </h1>
          {subtitle && (
            <span className="text-xs text-slate-500 mt-1 truncate">
              {subtitle}
            </span>
          )}
        </div>

        {/* RIGHT BLOCK - FIXED: Added flex-nowrap and removed wrapping behavior */}
        <div className="flex flex-nowrap items-center justify-end gap-3 lg:ml-auto overflow-x-auto no-scrollbar py-1">

          {/* EXTRA CONTROLS (e.g. RM Selector) */}
          {extraControls && (
            <div className="flex-shrink-0">
              {extraControls}
            </div>
          )}

          {/* PERIOD */}
          <div className="flex-shrink-0 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 h-9 transition-colors hover:bg-slate-100 hover:border-slate-300">
            <CalendarIcon />
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="bg-transparent text-sm text-slate-800 outline-none w-[110px] cursor-pointer"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="bg-transparent text-sm text-slate-800 outline-none w-[110px] cursor-pointer"
            />
          </div>

          {/* ONLINE STATUS */}
          <div className={`flex-shrink-0 flex items-center gap-2 px-3 h-9 text-xs font-medium rounded-2xl border ${isLoading ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {isLoading ? (
               <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            ) : (
               <CheckIcon />
            )}
            <span className="whitespace-nowrap">{isLoading ? 'Syncing...' : 'Online'}</span>
          </div>

          {/* SAVE BUTTON */}
          {onSave && (
            <button
              onClick={onSave}
              className="flex-shrink-0 h-9 px-4 rounded-2xl text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition shadow-sm whitespace-nowrap"
            >
              Сохранить
            </button>
          )}

          {/* CLOUD SYNC */}
          {onCloudSync && (
            <button
              onClick={onCloudSync}
              className="flex-shrink-0 h-9 px-4 rounded-2xl text-xs font-medium bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:opacity-90 transition shadow-sm flex items-center gap-2 whitespace-nowrap"
            >
              <CloudDownloadIcon />
              Загрузить
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default TopBar;
