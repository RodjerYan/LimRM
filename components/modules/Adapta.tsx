
import React, { useState, useMemo, useEffect } from 'react';
import FileUpload from '../FileUpload';
import OKBManagement from '../OKBManagement';
import OutlierDetailsModal from '../OutlierDetailsModal';
import Modal from '../Modal';
import EmptyState from '../EmptyState';
import Motion from '../Motion';
import TopBar from '../TopBar';
import DataTable from '../DataTable';
import { ChartCard, ChannelBarChart } from '../charts/PremiumCharts';

import { OkbStatus, WorkerResultPayload, AggregatedDataRow, FileProcessingState, MapPoint } from '../../types';
import {
  AlertIcon,
  InfoIcon,
  SuccessIcon,
  LoaderIcon,
  SearchIcon,
  UsersIcon,
} from '../icons';
import { detectOutliers } from '../../utils/analytics';

import { Card, CardHeader, CardBody } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { StatTile } from '../ui/StatTile';

interface AdaptaProps {
  processingState: FileProcessingState;
  onForceUpdate?: () => void;
  onFileProcessed: (data: WorkerResultPayload) => void;
  onProcessingStateChange: (isLoading: boolean, message: string) => void;
  okbData: any[];
  okbStatus: OkbStatus | null;
  onOkbStatusChange: (status: OkbStatus) => void;
  onOkbDataChange: (data: any[]) => void;
  disabled: boolean;
  unidentifiedCount: number;
  onUnidentifiedClick?: () => void;
  activeClientsCount: number;
  uploadedData?: AggregatedDataRow[];
  dbStatus?: 'empty' | 'ready' | 'loading';
  onStartEdit?: (client: MapPoint) => void;

  // Date Props (Analysis)
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;

  // Load Props (Sync)
  loadStartDate?: string;
  loadEndDate?: string;
  onLoadStartDateChange?: (date: string) => void;
  onLoadEndDateChange?: (date: string) => void;

  // Navigation & Search Integration
  openChannelRequest?: string | null;
  onConsumeOpenChannelRequest?: () => void;
  onTabChange?: (tab: string) => void;
  setIsSearchOpen?: (isOpen: boolean) => void;
}

interface OutlierItem {
  row: AggregatedDataRow;
  zScore: number;
  reason: string;
}

const Adapta: React.FC<AdaptaProps> = (props) => {
  const [activeTab, setActiveTab] = useState<'ingest' | 'hygiene'>('ingest');
  const [selectedOutlier, setSelectedOutlier] = useState<OutlierItem | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channelSearchTerm, setChannelSearchTerm] = useState('');

  // Handle external request to open a channel (e.g., from Global Search)
  useEffect(() => {
    if (props.openChannelRequest) {
      setSelectedChannel(props.openChannelRequest);
      props.onConsumeOpenChannelRequest?.();
    }
  }, [props.openChannelRequest, props.onConsumeOpenChannelRequest]);

  const healthScore = useMemo(() => {
    if (props.activeClientsCount === 0) return 0;
    const penalty = props.unidentifiedCount * 5;
    const baseScore = 100;
    return Math.max(0, Math.round(baseScore - (penalty / props.activeClientsCount) * 100));
  }, [props.activeClientsCount, props.unidentifiedCount]);

  const healthTone = healthScore > 80 ? 'lime' : healthScore > 50 ? 'blue' : 'red';

  // Helper to get client fact for the selected period
  const getClientFact = (client: MapPoint) => {
    // If client has detailed monthly data, we MUST use it to respect the filter
    if (client.monthlyFact && Object.keys(client.monthlyFact).length > 0) {
      let sum = 0;

      // Normalize filter inputs to YYYY-MM for comparison with keys
      const filterStart = props.startDate ? props.startDate.substring(0, 7) : null;
      const filterEnd = props.endDate ? props.endDate.substring(0, 7) : null;

      Object.entries(client.monthlyFact).forEach(([date, val]) => {
        if (date === 'unknown') return;

        // Compare YYYY-MM strings
        if (filterStart && date < filterStart) return;
        if (filterEnd && date > filterEnd) return;

        sum += val;
      });
      return sum;
    }

    return client.fact || 0;
  };

  // Fixed Universe of Clients (Base Clients) based on CURRENT filter
  const baseClientKeys = useMemo(() => {
    const set = new Set<string>();
    if (props.uploadedData) {
      props.uploadedData.forEach((row) => {
        row.clients.forEach((c) => {
          const fact = getClientFact(c);
          if (fact > 0.001) set.add(c.key);
        });
      });
    }
    return set;
  }, [props.uploadedData, props.startDate, props.endDate]);

  const outliers = useMemo<OutlierItem[]>(() => {
    if (!props.uploadedData || props.uploadedData.length === 0) return [];

    const relevantData = props.uploadedData
      .map((row) => {
        const activeClients = row.clients
          .map((client) => ({
            ...client,
            fact: getClientFact(client),
          }))
          .filter((c) => (c.fact || 0) > 0);

        const rowFact = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);

        return {
            ...row,
            clients: activeClients,
            fact: rowFact,
        };
      })
      .filter((row) => row.fact > 0);

    return detectOutliers(relevantData);
  }, [props.uploadedData, props.startDate, props.endDate]);

  const channelStats = useMemo(() => {
    if (!props.uploadedData || props.uploadedData.length === 0) return [];
    const acc: Record<string, { uniqueKeys: Set<string>; volume: number }> = {};
    const globalUniqueKeys = new Set<string>();

    props.uploadedData.forEach((row) => {
      row.clients.forEach((client) => {
        if (!baseClientKeys.has(client.key)) return;

        const effectiveFact = getClientFact(client);
        const type = client.type || 'Не определен';
        if (!acc[type]) acc[type] = { uniqueKeys: new Set(), volume: 0 };

        acc[type].uniqueKeys.add(client.key);
        acc[type].volume += effectiveFact;
        globalUniqueKeys.add(client.key);
      });
    });

    const totalUniqueCount = globalUniqueKeys.size;
    return Object.entries(acc)
      .map(([name, data]) => ({
        name,
        count: data.uniqueKeys.size,
        volumeTons: data.volume / 1000,
        percentage: totalUniqueCount > 0 ? (data.uniqueKeys.size / totalUniqueCount) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [props.uploadedData, props.startDate, props.endDate, baseClientKeys]);

  const groupedChannelData = useMemo(() => {
    if (!selectedChannel || !props.uploadedData) return null;
    const uniqueClientsInChannel = new Map<string, MapPoint & { totalFact: number }>();
    const safeLower = (val: any) => (val || '').toString().toLowerCase();

    props.uploadedData.forEach((row) => {
      row.clients.forEach((c) => {
        if (!baseClientKeys.has(c.key)) return;

        const effectiveFact = getClientFact(c);

        if ((c.type || 'Не определен') === selectedChannel) {
          const search = channelSearchTerm.toLowerCase();
          if (
            !search ||
            safeLower(c.name).includes(search) ||
            safeLower(c.address).includes(search) ||
            safeLower(c.rm).includes(search)
          ) {
            if (!uniqueClientsInChannel.has(c.key)) {
              uniqueClientsInChannel.set(c.key, { ...c, totalFact: 0 });
            }
            const existing = uniqueClientsInChannel.get(c.key)!;
            existing.totalFact += effectiveFact;
          }
        }
      });
    });

    const hierarchy: Record<string, Record<string, (MapPoint & { totalFact: number })[]>> = {};
    uniqueClientsInChannel.forEach((c) => {
      const rm = c.rm || 'Не указан';
      const city = c.city || 'Город не определен';
      if (!hierarchy[rm]) hierarchy[rm] = {};
      if (!hierarchy[rm][city]) hierarchy[rm][city] = [];
      hierarchy[rm][city].push(c);
    });
    return hierarchy;
  }, [selectedChannel, props.uploadedData, channelSearchTerm, props.startDate, props.endDate, baseClientKeys]);

  const rowsToDisplay = useMemo(() => {
    if (props.processingState.isProcessing) {
      return (props.processingState.totalRowsProcessed || 0).toLocaleString('ru-RU');
    }
    return baseClientKeys.size.toLocaleString('ru-RU');
  }, [props.processingState.isProcessing, props.processingState.totalRowsProcessed, baseClientKeys]);

  return (
    <div className="space-y-6">
      {/* Header with New TopBar (No Extra Buttons) */}
      <Motion delayMs={0}>
        <div data-tour="topbar">
            <TopBar
                title="ADAPTA"
                subtitle="Live Data Ingestion & Quality Control"
                startDate={props.startDate}
                endDate={props.endDate}
                onStartDateChange={props.onStartDateChange}
                onEndDateChange={props.onEndDateChange}
                isLoading={props.processingState.isProcessing}
                onCloudSync={() => {
                    setActiveTab('ingest');
                    if (props.onForceUpdate) props.onForceUpdate();
                }}
            />
        </div>
      </Motion>

      {/* Clean Segmented Tab Switcher */}
      <Motion delayMs={50}>
        <div className="flex justify-center">
            <div className="bg-slate-200/50 p-1 rounded-2xl flex gap-1">
                <button
                    onClick={() => setActiveTab('ingest')}
                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'ingest' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Cloud Sync
                </button>
                <button
                    onClick={() => setActiveTab('hygiene')}
                    disabled={props.activeClientsCount === 0}
                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'hygiene' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50'}`}
                >
                    Качество (DQ)
                </button>
            </div>
        </div>
      </Motion>

      {/* Recommended UX: Filtered out state */}
      {props.activeClientsCount > 0 && baseClientKeys.size === 0 && (
        <Motion delayMs={80}>
          <EmptyState
            kind="noResults"
            tone="info"
            title="По выбранному периоду данных нет"
            description="Расширьте диапазон дат или сбросьте фильтры."
            action={
              <button
                onClick={() => { props.onStartDateChange(''); props.onEndDateChange(''); }}
                className="rounded-2xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-[0_14px_40px_rgba(99,102,241,0.22)] hover:from-indigo-500 hover:to-sky-400 transition-all"
              >
                Сбросить период
              </button>
            }
          />
        </Motion>
      )}

      {activeTab === 'ingest' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left stack */}
          <div className="space-y-6">
            <Motion delayMs={100}>
              {/* Cloud Engine card */}
              <Card className="relative overflow-hidden">
                <CardHeader
                  title="Облачный движок"
                  subtitle="Статус индекса и потоковой обработки"
                  right={
                    props.processingState.isProcessing ? (
                      <Chip tone="blue">
                        <span className="inline-flex items-center gap-2">
                          <LoaderIcon className="w-3 h-3" /> Streaming
                        </span>
                      </Chip>
                    ) : (
                      <Chip tone="lime">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Online
                        </span>
                      </Chip>
                    )
                  }
                />
                <CardBody className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={[
                        'w-12 h-12 rounded-2xl border flex items-center justify-center shadow-sm',
                        props.dbStatus === 'ready'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                          : 'bg-slate-50 text-slate-400 border-slate-200',
                      ].join(' ')}
                    >
                      {props.dbStatus === 'ready' ? <SuccessIcon /> : <InfoIcon />}
                    </div>
                    <div>
                      <div className="t-h2 leading-none">
                        {props.dbStatus === 'ready' ? 'Live Index: OK' : 'No Index Found'}
                      </div>
                      <div className="t-muted mt-1">
                        {props.activeClientsCount.toLocaleString()} уник. ТТ
                      </div>
                    </div>
                  </div>

                  {props.processingState.isProcessing && (
                    <div className="pt-2">
                      <div className="flex justify-between text-[11px] text-slate-500 mb-2 font-semibold uppercase tracking-[0.08em]">
                        <span>Прогресс индексации</span>
                        <span className="text-indigo-700">{Math.round(props.processingState.progress)}%</span>
                      </div>
                      <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-600 to-sky-500 transition-all duration-500 shimmer"
                          style={{ width: `${props.processingState.progress}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2 italic leading-tight">
                        {props.processingState.message}
                      </p>
                    </div>
                  )}
                </CardBody>
              </Card>
            </Motion>

            {/* Step 1 & Step 2 */}
            <Motion delayMs={150}>
              <div data-tour="okb">
                <OKBManagement
                    onStatusChange={props.onOkbStatusChange}
                    onDataChange={props.onOkbDataChange}
                    status={props.okbStatus}
                    disabled={props.disabled}
                />
              </div>
            </Motion>

            <Motion delayMs={200}>
              <div data-tour="upload">
                <FileUpload
                    processingState={props.processingState}
                    onForceUpdate={props.onForceUpdate}
                    okbStatus={props.okbStatus}
                    disabled={props.disabled || !props.okbStatus || props.okbStatus.status !== 'ready'}
                    loadStartDate={props.loadStartDate}
                    loadEndDate={props.loadEndDate}
                    onLoadStartDateChange={props.onLoadStartDateChange}
                    onLoadEndDateChange={props.onLoadEndDateChange}
                />
              </div>
            </Motion>
          </div>

          {/* Right side */}
          <div className="lg:col-span-2 space-y-6">
            <Motion delayMs={150}>
              {/* Data quality */}
              <div className="relative">
                <div
                  className="pointer-events-none absolute -inset-1 rounded-[28px] opacity-60 blur-2xl"
                  style={{
                    background:
                      'radial-gradient(600px 240px at 20% 0%, rgba(163,230,53,0.14), transparent 60%),' +
                      'radial-gradient(520px 240px at 80% 10%, rgba(99,102,241,0.12), transparent 60%)',
                  }}
                />
                <Card className="relative">
                  <CardHeader
                    title="Качество загруженных данных"
                    subtitle="Сводный health score и контроль проблем"
                    right={<Chip tone={healthTone as any}>{healthScore}%</Chip>}
                  />
                  <CardBody className="space-y-5">
                    <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden relative">
                      <div
                        className="h-full transition-all duration-1000 ease-out shimmer"
                        style={{
                          width: `${healthScore}%`,
                          background:
                            healthScore > 80
                              ? 'linear-gradient(90deg, rgba(16,185,129,1), rgba(34,211,238,1))'
                              : healthScore > 50
                              ? 'linear-gradient(90deg, rgba(99,102,241,1), rgba(34,211,238,1))'
                              : 'linear-gradient(90deg, rgba(239,68,68,1), rgba(236,72,153,1))',
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatTile
                        label="Обработано записей"
                        value={rowsToDisplay}
                        accent="neutral"
                        footnote={
                          props.processingState.isProcessing
                            ? 'Чтение снимка…'
                            : props.startDate || props.endDate
                            ? 'Отфильтровано'
                            : 'Всего в системе'
                        }
                      />
                      <StatTile
                        label="Уникальных ТТ"
                        value={props.activeClientsCount.toLocaleString('ru-RU')}
                        accent="lime"
                        footnote="Гео-объектов"
                      />

                      {/* Unidentified clickable */}
                      <div
                        role={props.onUnidentifiedClick ? 'button' : undefined}
                        tabIndex={props.onUnidentifiedClick ? 0 : -1}
                        onClick={props.onUnidentifiedClick}
                        className={[
                          'rounded-3xl border border-slate-200/70 bg-white/70 p-3.5',
                          'shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all hover:bg-white hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)]',
                          props.onUnidentifiedClick ? 'cursor-pointer active:scale-[0.98]' : '',
                          'flex flex-col justify-between h-full'
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-600 font-bold truncate">
                            Неопознанные
                          </div>
                          {props.onUnidentifiedClick && (
                            <div className="text-indigo-600">
                              <SearchIcon small />
                            </div>
                          )}
                        </div>
                        
                        {/* Improved styling for the metric value (using clamp 13-18px) */}
                        <div
                            className={`mt-1 font-semibold tabular-nums break-words leading-none tracking-tight ${props.unidentifiedCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                            style={{ fontSize: "clamp(13px, 1.15vw, 18px)" }}
                            title={props.unidentifiedCount.toLocaleString('ru-RU')}
                        >
                          {props.unidentifiedCount.toLocaleString('ru-RU')}
                        </div>

                        <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                          {props.unidentifiedCount > 0 ? (
                            <span className="text-amber-700">⚠️ Ошибка разбора</span>
                          ) : (
                            <span className="text-emerald-700">● Всё чисто</span>
                          )}
                        </div>
                      </div>

                      <StatTile
                        label="Режим"
                        value={props.processingState.isProcessing ? 'Streaming' : 'Online'}
                        accent="blue"
                        footnote="Preview доступен"
                      />
                    </div>
                  </CardBody>
                </Card>
              </div>
            </Motion>

            <Motion delayMs={200}>
              <div data-tour="channels">
                {channelStats.length > 0 ? (
                  <ChartCard
                    title="Структура каналов сбыта"
                    subtitle="Распределение уникальных торговых точек по каналам"
                  >
                    <div className="flex flex-col gap-4">
                      {/* Chart Area - fixed height */}
                      <div className="h-[320px] w-full">
                        <ChannelBarChart
                          data={channelStats.map(s => ({
                            name: s.name,
                            count: s.count,
                            volumeTons: s.volumeTons,
                          }))}
                        />
                      </div>

                      {/* List View inside the card */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-slate-100 pt-6">
                        {channelStats.slice(0, 6).map((stat) => (
                          <button
                            key={stat.name}
                            onClick={() => setSelectedChannel(stat.name)}
                            className="text-left rounded-2xl border border-slate-200/70 bg-white/50 p-4 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,23,42,0.06)] active:scale-[0.98] transition-all"
                          >
                            <div className="t-label mb-1">{stat.name}</div>
                            <div className="text-xl font-semibold text-slate-900 tabular-nums tracking-tight">
                              {stat.count.toLocaleString('ru-RU')}
                            </div>
                            <div className="t-muted mt-1">
                              {stat.percentage.toFixed(1)}% от базы
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </ChartCard>
                ) : (
                  <Card>
                    <CardHeader
                      title="Каналы продаж"
                      subtitle="Распределение уникальных адресов по типам"
                      right={<Chip tone="neutral">Нет данных</Chip>}
                    />
                    <CardBody>
                      <EmptyState
                        kind="empty"
                        tone="neutral"
                        title="Нет данных для каналов"
                        description="Сначала синхронизируйте Cloud Snapshots (Шаг 2)."
                      />
                    </CardBody>
                  </Card>
                )}
              </div>
            </Motion>

            <Motion delayMs={250}>
              {/* Info callout */}
              <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-900 shadow-sm">
                <strong className="block mb-1 text-indigo-700 flex items-center gap-2 font-semibold">
                  <InfoIcon small /> Технология Online Preview:
                </strong>
                Вы можете использовать аналитику, пока данные синхронизируются в фоне. Система обновляет расчеты в реальном времени
                при получении новых блоков строк.
              </div>
            </Motion>
          </div>
        </div>
      ) : (
        // Hygiene tab (DQ / Outliers)
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Motion delayMs={100}>
              <Card>
                <CardHeader
                  title="Статистический анализ (Z-Score)"
                  subtitle="Автоматическое выявление аномалий в продажах"
                  right={<Chip tone="neutral">DQ</Chip>}
                />
                <CardBody className="space-y-4">
                  <p className="t-body text-slate-500">
                    Инструмент контроля качества (Data Quality). Нажмите на строку, чтобы посмотреть детализацию.
                  </p>
                  <div className="flex items-center gap-2 text-amber-800 text-sm bg-amber-50 p-4 rounded-2xl border border-amber-200">
                    <AlertIcon small />
                    <span>
                      Найдено аномалий: <strong>{outliers.length}</strong>
                    </span>
                  </div>
                </CardBody>
              </Card>
            </Motion>
          </div>

          <div className="lg:col-span-2">
            <Motion delayMs={150}>
              <Card className="h-full overflow-hidden">
                <CardHeader title="Детализация аномалий" subtitle="Клик по строке → разбор" />
                <CardBody className="pt-0">
                  <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <DataTable
                      rows={outliers}
                      onRowClick={(row) => setSelectedOutlier(row)}
                      empty={
                        <EmptyState
                          tone="success"
                          title="Аномалий не найдено"
                          description="На выбранном периоде статистических выбросов нет."
                        />
                      }
                      columns={[
                        {
                          key: "name",
                          title: "Клиент",
                          render: (r) => (
                            <span className="font-semibold text-slate-900">
                              {r.row.clientName}
                            </span>
                          ),
                        },
                        {
                          key: "fact",
                          title: "Факт",
                          align: "right",
                          render: (r) => (
                            <span className="t-mono">
                              {new Intl.NumberFormat('ru-RU').format(r.row.fact)}
                            </span>
                          ),
                        },
                        {
                          key: "z",
                          title: "Z",
                          align: "right",
                          render: (r) => (
                            <span
                              className={`t-mono font-bold ${
                                Math.abs(r.zScore) > 3
                                  ? "text-red-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {r.zScore.toFixed(2)}
                            </span>
                          ),
                        },
                        {
                          key: "reason",
                          title: "Диагноз",
                          render: (r) => (
                            <span className="t-muted">
                              {r.reason}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </div>
                </CardBody>
              </Card>
            </Motion>
          </div>
        </div>
      )}

      {/* Channel modal */}
      {selectedChannel && (
        <Modal
          isOpen={!!selectedChannel}
          onClose={() => setSelectedChannel(null)}
          title={
            <div className="flex flex-col">
              <span className="t-h2">Канал: {selectedChannel}</span>
              <span className="t-label mt-1">
                Детализация уник. адресов по РМ и городам
              </span>
            </div>
          }
          maxWidth="max-w-5xl"
        >
          <div className="space-y-4">
            <div className="relative mb-6">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <SearchIcon small />
              </div>
              <input
                type="text"
                placeholder="Поиск по адресу, названию ТТ или менеджеру..."
                value={channelSearchTerm}
                onChange={(e) => setChannelSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-10 pr-4 text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 outline-none transition-all font-medium"
              />
            </div>

            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {groupedChannelData && Object.keys(groupedChannelData).length > 0 ? (
                <div className="space-y-8">
                  {Object.entries(groupedChannelData)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([rm, cities]) => (
                      <div key={rm} className="space-y-4">
                        <div className="sticky top-0 bg-white/95 backdrop-blur z-10 py-2 border-b border-slate-200 flex justify-between items-center">
                          <h4 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                            <div className="p-1 bg-indigo-50 rounded-xl border border-indigo-200">
                              <UsersIcon small />
                            </div>{' '}
                            {rm}
                          </h4>
                          <span className="text-[10px] bg-slate-50 text-slate-600 px-2 py-1 rounded-xl border border-slate-200 font-semibold">
                            {Object.values(cities).flat().length} ТТ
                          </span>
                        </div>

                        <div className="pl-4 space-y-6">
                          {Object.entries(cities)
                            .sort((a, b) => a[0].localeCompare(b[0]))
                            .map(([city, clients]) => (
                              <div key={city} className="space-y-2">
                                <h5 className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                  {city}
                                </h5>

                                <div className="grid grid-cols-1 gap-2">
                                  {clients.map((client, cIdx) => (
                                    <div
                                      key={cIdx}
                                      className="bg-slate-50 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] active:scale-[0.99] transition-all flex justify-between items-start gap-4 group"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold text-slate-900 truncate" title={client.name}>
                                          {client.name}
                                        </div>
                                        <div
                                          className="text-[11px] text-slate-500 mt-1 truncate cursor-pointer hover:text-indigo-700 flex items-center gap-1 transition-colors font-medium"
                                          onClick={() => props.onStartEdit?.(client)}
                                        >
                                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">📍</span>
                                          {client.address}
                                        </div>
                                      </div>

                                      <div className="flex flex-col items-end shrink-0">
                                        <div className="text-[11px] font-mono font-semibold text-emerald-700">
                                          {(client.totalFact || 0).toLocaleString('ru-RU')}{' '}
                                          <span className="text-[9px] text-slate-400 font-normal">кг</span>
                                        </div>
                                        <div className="text-[9px] text-slate-400 mt-0.5 uppercase font-semibold tracking-tight">
                                          {client.brand || 'Уникальная ТТ'}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState
                  kind="noResults"
                  tone="info"
                  title="Ничего не найдено"
                  description="Попробуйте убрать часть запроса или искать по адресу/РМ."
                />
              )}
            </div>
          </div>
        </Modal>
      )}

      {selectedOutlier && (
        <OutlierDetailsModal isOpen={!!selectedOutlier} onClose={() => setSelectedOutlier(null)} item={selectedOutlier} />
      )}
    </div>
  );
};

export default Adapta;
