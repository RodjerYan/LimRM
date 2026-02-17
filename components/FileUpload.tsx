
import React from 'react';
import { OkbStatus, FileProcessingState } from '../types';
import { DataIcon, LoaderIcon } from './icons';

interface FileUploadProps {
  processingState: FileProcessingState;
  onForceUpdate?: () => void;
  okbStatus: OkbStatus | null;
  disabled: boolean;

  // Date Filtering (Legacy props kept for interface compatibility, but UI removed)
  loadStartDate?: string;
  loadEndDate?: string;
  onLoadStartDateChange?: (date: string) => void;
  onLoadEndDateChange?: (date: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  processingState,
  onForceUpdate,
  okbStatus,
  disabled,
}) => {
  const { isProcessing, progress, message, fileName } = processingState;
  const isBlocked = disabled || !okbStatus || okbStatus.status !== 'ready';

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/70 shadow-[0_18px_50px_rgba(15,23,42,0.08)] relative overflow-hidden">
        {/* Blocking Overlay */}
        {isBlocked && (
            <div className="absolute inset-0 bg-white/60 z-10 cursor-not-allowed" />
        )}

        {/* Header */}
        <div className="flex justify-between items-start mb-6">
            <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Данные Продаж</h3>
                <p className="text-xs text-slate-500 mt-1">Источник: Cloud Snapshots (JSON)</p>
            </div>
            <div className="flex items-center gap-2">
                 <div className="bg-indigo-100 text-indigo-600 px-2 py-1 rounded-lg text-[10px] font-black border border-indigo-200">SYNC</div>
                 <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm border border-indigo-200">2</div>
            </div>
        </div>

        {/* Main Content */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-6 flex items-center gap-4 relative overflow-hidden">
            {/* Progress Bar (Background) */}
            {isProcessing && (
                 <div className="absolute bottom-0 left-0 h-1 bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            )}

            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                {isProcessing ? <LoaderIcon className="animate-spin text-indigo-500" /> : <DataIcon />}
            </div>
            
            <div className="min-w-0 flex-grow">
                 <div className="text-sm font-bold text-slate-900">
                     {isProcessing ? 'Синхронизация...' : 'Актуализация'}
                 </div>
                 <div className="text-xs text-slate-500 truncate mt-0.5">
                     {isProcessing ? message : 'Только быстрые снимки (Snapshots)'}
                 </div>
            </div>

            <div className="shrink-0">
                 <span className="text-[10px] font-black text-emerald-600 uppercase bg-white border border-emerald-200 px-2 py-1 rounded-lg tracking-wider shadow-sm">
                     FAST
                 </span>
            </div>
        </div>

        {/* Action Button */}
        <button
            onClick={onForceUpdate}
            disabled={disabled}
            className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95 border border-slate-200"
        >
            Синхронизировать
        </button>
    </div>
  );
};

export default React.memo(FileUpload);