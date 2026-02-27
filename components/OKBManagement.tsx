
import React, { useState, useEffect, useCallback } from 'react';
import { OkbDataRow, OkbStatus } from '../types';
import { LoaderIcon, SuccessIcon, ErrorIcon, CheckIcon } from './icons';

interface OKBManagementProps {
  onStatusChange: (status: OkbStatus) => void;
  onDataChange: (data: OkbDataRow[]) => void;
  status: OkbStatus | null;
  disabled: boolean;
  potentialRowCount?: number;
  potentialCoordsCount?: number;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ onStatusChange, onDataChange, status, disabled, potentialRowCount, potentialCoordsCount }) => {
  const [isFetching, setIsFetching] = useState(false);

  const handleFetchData = useCallback(
    async (forceUpdate = false) => {
      setIsFetching(true);
      onStatusChange({
        status: 'loading',
        message: forceUpdate ? 'Обновление с сервера...' : 'Подключение к серверу...',
      });

      try {
        const url = `/api/get-akb?mode=okb_data&t=${Date.now()}`;
        const response = await fetch(url);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            (errorData as any).details ||
              (errorData as any).error ||
              `Ошибка сервера: ${response.status} ${response.statusText}`
          );
        }

        const data: OkbDataRow[] = await response.json();

        onDataChange(data);
        onStatusChange({
          status: 'ready',
          message: `ОКБ Онлайн (v5 Live)`,
          timestamp: new Date().toISOString(),
          rowCount: data.length,
          coordsCount: data.filter((d) => d.lat && d.lon).length,
        });
      } catch (error) {
        console.error('OKB Load Error:', error);
        onStatusChange({ status: 'error', message: (error as Error).message });
      } finally {
        setIsFetching(false);
      }
    },
    [onStatusChange, onDataChange]
  );

  useEffect(() => {
    if (!status || status.status === 'idle') {
      handleFetchData(false);
    }
  }, [status, handleFetchData]);

  const isLoading = isFetching || status?.status === 'loading';
  const isReady = status?.status === 'ready';
  const isError = status?.status === 'error';

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/70 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
            <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">База Клиентов</h3>
                <p className="text-xs text-slate-500 mt-1">Прямое подключение (60s Update)</p>
            </div>
            <div className="flex items-center gap-2">
                 <div className="bg-sky-100 text-sky-600 px-2 py-1 rounded-lg text-[10px] font-black border border-sky-200">LIVE</div>
                 <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-black text-sm border border-sky-200">1</div>
            </div>
        </div>

        {/* Main Status Block */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-6 flex justify-between items-center">
             <div className="flex items-center gap-3">
                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isReady ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : isError ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-200 text-slate-400'}`}>
                      {isLoading ? <LoaderIcon className="animate-spin"/> : isReady ? <CheckIcon /> : isError ? <ErrorIcon /> : <div className="w-2 h-2 rounded-full bg-slate-300"/>}
                 </div>
                 <div>
                      <div className="text-sm font-bold text-slate-900 leading-tight">
                          {status?.message || 'Ожидание...'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Данные актуальны</div>
                 </div>
             </div>
             <div>
                  {isReady && (
                      <span className="text-[10px] font-black text-emerald-600 uppercase bg-white border border-emerald-200 px-2 py-1 rounded-lg tracking-wider">
                          READY
                      </span>
                  )}
                  {isError && <span className="text-[10px] font-black text-red-600 uppercase bg-white border border-red-200 px-2 py-1 rounded-lg">ERROR</span>}
                  {isLoading && <span className="text-[10px] font-black text-slate-500 uppercase bg-white border border-slate-200 px-2 py-1 rounded-lg">LOADING</span>}
             </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
             <div className="p-3 border border-slate-200 rounded-2xl flex flex-col justify-between h-20 shadow-sm">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-3">
                      Всего<br/>записей
                  </div>
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                      {potentialRowCount !== undefined ? potentialRowCount.toLocaleString('ru-RU') : (status?.rowCount ? status.rowCount.toLocaleString('ru-RU') : '—')}
                  </div>
             </div>
             <div className="p-3 border border-slate-200 rounded-2xl flex flex-col justify-between h-20 shadow-sm">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-3">
                      С коорди-<br/>натами
                  </div>
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                      {potentialCoordsCount !== undefined ? potentialCoordsCount.toLocaleString('ru-RU') : (status?.coordsCount ? status.coordsCount.toLocaleString('ru-RU') : '—')}
                  </div>
             </div>
             <div className="p-3 border border-slate-200 rounded-2xl flex flex-col justify-between h-20 shadow-sm">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-3">
                      Время<br/>обновления
                  </div>
                  <div className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                      {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) : '—'}
                  </div>
             </div>
        </div>

        {/* Action Button */}
        <button
            onClick={() => handleFetchData(true)}
            disabled={isLoading || disabled}
            className="w-full py-4 bg-sky-100 hover:bg-sky-200 text-sky-700 font-bold rounded-2xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95 border border-sky-200"
        >
            {isLoading ? 'Загрузка...' : 'Обновить данные'}
        </button>

    </div>
  );
};

export default OKBManagement;
