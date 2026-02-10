
import React, { useState, useEffect, useCallback } from 'react';
import { OkbDataRow, OkbStatus } from '../types';
import { LoaderIcon, SuccessIcon, ErrorIcon } from './icons';

import { Card, CardHeader, CardBody } from './ui/Card';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { StatTile } from './ui/StatTile';

interface OKBManagementProps {
  onStatusChange: (status: OkbStatus) => void;
  onDataChange: (data: OkbDataRow[]) => void;
  status: OkbStatus | null;
  disabled: boolean;
}

const OKBManagement: React.FC<OKBManagementProps> = ({ onStatusChange, onDataChange, status, disabled }) => {
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

  const bannerTone = isError ? 'red' : isReady ? 'lime' : 'neutral';

  return (
    <div className="relative">
      {/* premium glow */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-[28px] opacity-60 blur-2xl"
        style={{
          background:
            'radial-gradient(600px 240px at 20% 0%, rgba(99,102,241,0.20), transparent 60%),' +
            'radial-gradient(520px 240px at 80% 10%, rgba(34,211,238,0.14), transparent 60%),' +
            'radial-gradient(520px 240px at 50% 100%, rgba(163,230,53,0.10), transparent 60%)',
        }}
      />

      <Card className="relative">
        <CardHeader
          title="База Клиентов"
          subtitle="Прямое подключение (60s Update)"
          right={
            <div className="flex items-center gap-2">
              <Chip tone="blue">LIVE</Chip>
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white font-black flex items-center justify-center shadow-[0_14px_40px_rgba(99,102,241,0.18)]">
                1
              </div>
            </div>
          }
        />

        <CardBody className="space-y-5">
          {/* Status banner */}
          <div
            className={[
              'rounded-2xl border p-4 flex items-center gap-3',
              bannerTone === 'red'
                ? 'bg-red-50 border-red-200'
                : bannerTone === 'lime'
                ? 'bg-lime-50 border-lime-200'
                : 'bg-slate-50 border-slate-200',
            ].join(' ')}
          >
            <div
              className={[
                'w-10 h-10 rounded-2xl border flex items-center justify-center shadow-sm',
                bannerTone === 'red'
                  ? 'bg-red-100 border-red-200 text-red-600'
                  : bannerTone === 'lime'
                  ? 'bg-lime-100 border-lime-200 text-lime-700'
                  : 'bg-white border-slate-200 text-slate-500',
              ].join(' ')}
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              ) : isError ? (
                <div className="w-5 h-5">
                  <ErrorIcon />
                </div>
              ) : isReady ? (
                <div className="w-5 h-5">
                  <SuccessIcon />
                </div>
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              )}
            </div>

            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 truncate">
                {status?.message || 'Ожидание подключения...'}
              </div>
              <div className="text-xs text-slate-500">
                {isLoading
                  ? 'Пожалуйста, подождите…'
                  : isReady
                  ? 'Данные актуальны'
                  : isError
                  ? 'Проверьте доступ к серверу'
                  : 'Готов к загрузке'}
              </div>
            </div>

            <div className="ml-auto">
              <Chip tone={isError ? 'red' : isReady ? 'lime' : 'neutral'}>
                {isLoading ? 'LOADING' : isError ? 'ERROR' : isReady ? 'READY' : 'IDLE'}
              </Chip>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile
              label="Всего записей"
              value={status?.rowCount ? status.rowCount.toLocaleString('ru-RU') : '—'}
              accent="neutral"
            />
            <StatTile
              label="С координатами"
              value={status?.coordsCount ? status.coordsCount.toLocaleString('ru-RU') : '—'}
              accent="blue"
            />
            <StatTile
              label="Версия от"
              value={status?.timestamp ? new Date(status.timestamp).toLocaleTimeString('ru-RU') : '…'}
              accent="lime"
              footnote="Время обновления"
            />
          </div>

          {/* Action */}
          <Button
            onClick={() => handleFetchData(true)}
            disabled={isLoading || disabled}
            className="w-full py-3.5 text-base rounded-2xl"
            variant="primary"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="w-4 h-4" /> Загрузка...
              </span>
            ) : isReady ? (
              'Обновить данные'
            ) : (
              'Загрузить базу'
            )}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
};

export default OKBManagement;
