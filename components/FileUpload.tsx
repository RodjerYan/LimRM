
import React from 'react';
import { OkbStatus, FileProcessingState } from '../types';
import { formatETR } from '../utils/timeUtils';
import { DataIcon, BrainIcon } from './icons';

import { Card, CardHeader, CardBody } from './ui/Card';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';

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
  const { isProcessing, progress, message, fileName, backgroundMessage, startTime } = processingState;
  const isBlocked = disabled || !okbStatus || okbStatus.status !== 'ready';
  const showBaseMissingOverlay = (!okbStatus || okbStatus.status !== 'ready') && !isProcessing && !fileName;

  const isAnalyzing = isProcessing && progress >= 80;

  let etr: number | null = null;
  if (isProcessing && startTime && progress > 0 && progress < 100) {
    const elapsedTime = (Date.now() - startTime) / 1000;
    const totalTime = (elapsedTime / progress) * 100;
    etr = totalTime - elapsedTime;
  }

  return (
    <div className={`relative ${isBlocked ? 'opacity-60' : ''}`}>
      {/* premium glow */}
      {!isBlocked && (
        <div
          className="pointer-events-none absolute -inset-1 rounded-[28px] opacity-60 blur-2xl"
          style={{
            background:
              'radial-gradient(600px 240px at 20% 0%, rgba(236,72,153,0.18), transparent 60%),' +
              'radial-gradient(520px 240px at 80% 10%, rgba(99,102,241,0.14), transparent 60%),' +
              'radial-gradient(520px 240px at 50% 100%, rgba(34,211,238,0.12), transparent 60%)',
          }}
        />
      )}

      <Card className="relative">
        <CardHeader
          title="Данные Продаж"
          subtitle="Источник: Cloud Snapshots (JSON)"
          right={
            <div className="flex items-center gap-2">
              {isBlocked ? <Chip tone="neutral">LOCKED</Chip> : <Chip tone="pink">SYNC</Chip>}
              <div
                className={[
                  'w-9 h-9 rounded-2xl text-white font-black flex items-center justify-center shadow-sm',
                  isBlocked
                    ? 'bg-slate-400'
                    : 'bg-gradient-to-br from-fuchsia-600 to-pink-500 shadow-[0_14px_40px_rgba(236,72,153,0.18)]',
                ].join(' ')}
              >
                2
              </div>
            </div>
          }
        />

        <CardBody className="space-y-5">
          {/* Content Area */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            {/* soft background blobs */}
            <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full blur-3xl opacity-40 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.40),transparent_60%)]" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 w-48 h-48 rounded-full blur-3xl opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(236,72,153,0.35),transparent_60%)]" />

            {isProcessing ? (
              <div className="relative z-10 flex flex-col items-center justify-center py-8">
                {isAnalyzing ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 text-indigo-600 mb-2">
                      <BrainIcon />
                    </div>
                    <p className="text-sm font-extrabold text-slate-900">Финализация данных…</p>
                    <p className="text-xs text-slate-500 mt-1">Почти готово</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin mb-3" />
                    <p className="text-sm font-extrabold text-slate-900">Синхронизация JSON…</p>
                    <p className="text-xs text-slate-500 mt-1">Загрузка и обработка снапшотов</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative z-10 flex flex-col gap-5">
                {/* Description row */}
                <div className="flex items-center gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-4">
                  <div className="w-11 h-11 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-sm shrink-0">
                    <DataIcon small />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900">Актуализация</div>
                    <div className="text-[11px] text-slate-500">Только быстрые снимки (Snapshots)</div>
                  </div>
                  <div className="ml-auto">
                    <Chip tone="lime">FAST</Chip>
                  </div>
                </div>

                <Button
                  onClick={onForceUpdate}
                  disabled={disabled}
                  className="w-full py-3.5 text-base rounded-2xl"
                  variant="primary"
                >
                  Синхронизировать
                </Button>
              </div>
            )}

            {/* Thin progress strip */}
            {progress > 0 && !isAnalyzing && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-200/70">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-300 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>

          {/* Status & Progress Details */}
          {isProcessing && (
            <div className="rounded-3xl border border-slate-200/70 bg-white/75 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm font-extrabold text-slate-900 truncate max-w-[70%]" title={fileName || 'Cloud Snapshot'}>
                  {fileName || `Cloud Snapshot`}
                </p>
                <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-2 py-1">
                  {Math.round(progress)}%
                </span>
              </div>

              <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-linear"
                  style={{
                    width: `${progress}%`,
                    background: isAnalyzing
                      ? 'linear-gradient(90deg, rgba(99,102,241,1), rgba(34,211,238,1))'
                      : 'linear-gradient(90deg, rgba(16,185,129,1), rgba(34,211,238,1))',
                  }}
                />
              </div>

              <div className="flex justify-between items-center text-xs">
                <p className="text-slate-500 max-w-[85%] overflow-hidden whitespace-nowrap text-ellipsis" title={message}>
                  {message}
                </p>
                {etr !== null && !isAnalyzing && (
                  <p className="text-slate-900 font-black ml-2 flex-shrink-0">{formatETR(etr)}</p>
                )}
              </div>

              {backgroundMessage && (
                <div className="mt-1 text-[11px] text-indigo-700 bg-indigo-50 px-3 py-2 rounded-2xl border border-indigo-200 flex items-center gap-2">
                  <div className="animate-spin w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full" />
                  <span className="truncate max-w-full">{backgroundMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Blocking overlay */}
          {showBaseMissingOverlay && (
            <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-3xl border border-slate-200">
              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-[0_20px_60px_rgba(15,23,42,0.14)] text-center max-w-[80%]">
                <p className="text-amber-800 text-sm font-extrabold">Сначала загрузите базу (Шаг 1)</p>
                <p className="text-amber-700/70 text-xs mt-1">После загрузки базы станет доступна синхронизация</p>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default React.memo(FileUpload);
