
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import FileUpload from '../FileUpload';
import OKBManagement from '../OKBManagement';
import OutlierDetailsModal from '../OutlierDetailsModal';
import Modal from '../Modal';
import EmptyState from '../EmptyState';
import Motion from '../Motion';
import TopBar from '../TopBar';
import DataTable from '../DataTable';
import { ChartCard, ChannelBarChart } from '../charts/PremiumCharts';
import { toDayKey } from '../../utils/dataUtils';
import { useAuth } from '../auth/AuthContext';

import { OkbStatus, WorkerResultPayload, AggregatedDataRow, FileProcessingState, MapPoint } from '../../types';
import {
  AlertIcon,
  InfoIcon,
  SuccessIcon,
  LoaderIcon,
  SearchIcon,
  UsersIcon,
  FilterIcon,
  FactIcon,
  CloudDownloadIcon,
  CheckIcon
} from '../icons';
import { detectOutliers } from '../../utils/analytics';

import { Card, CardHeader, CardBody } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { StatTile } from '../ui/StatTile';

const MIN_FACT = 0.001;

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
  loadStartDate: string;
  loadEndDate: string;
  onLoadStartDateChange: (date: string) => void;
  onLoadEndDateChange: (date: string) => void;

  // Navigation & Search Integration
  openChannelRequest?: string | null;
  onConsumeOpenChannelRequest?: () => void;
  onTabChange?: (tab: string) => void;
  setIsSearchOpen?: (isOpen: boolean) => void;

  // Filtering
  selectedRm?: string;
  onRmChange?: (rm: string) => void;
}

interface OutlierItem {
  row: AggregatedDataRow;
  zScore: number;
  reason: string;
}

const Adapta: React.FC<AdaptaProps> = (props) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'ingest' | 'hygiene'>('ingest');
  const [selectedOutlier, setSelectedOutlier] = useState<OutlierItem | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [channelSearchTerm, setChannelSearchTerm] = useState('');
  
  // Determine Effective Period
  const effectiveStart = props.startDate;
  const effectiveEnd = props.endDate;

  // Extract unique RMs for the dropdown
  const availableRMs = useMemo(() => {
      if (!props.uploadedData) return [];
      const rms = new Set<string>();
      props.uploadedData.forEach(row => {
          if (row.rm) rms.add(row.rm);
      });
      return Array.from(rms).sort();
  }, [props.uploadedData]);

  // Dynamic Greeting based on User's local time
  const dynamicSubtitle = useMemo(() => {
    const hour = new Date().getHours();
    let greeting = 'Доброй ночи';
    
    if (hour >= 6 && hour < 11) greeting = 'Доброе утро';
    else if (hour >= 11 && hour < 17) greeting = 'Добрый день';
    else if (hour >= 17 && hour < 22) greeting = 'Добрый вечер';
    
    const userName = user?.firstName || 'Пользователь';
    return `${greeting}, ${userName}. Для расчёта продаж выберите период в календаре и нажмите кнопку "Загрузить"`;
  }, [user]);

  useEffect(() => {
    if (props.openChannelRequest) {
      setSelectedChannel(props.openChannelRequest);
      props.onConsumeOpenChannelRequest?.();
    }
  }, [props.openChannelRequest, props.onConsumeOpenChannelRequest]);

  // Helper to ensure unique identification even if primary key is missing
  const getSafeKey = useCallback((c: MapPoint) => {
    const k = (c?.key ?? '').toString().trim();
    if (k) return k;

    // fallback key, stable-ish for “no key” cases
    return `__nokey__:${(c.address || '')}|${(c.name || '')}|${(c.rm || '')}|${(c.city || '')}|${(c.region || '')}`
      .toLowerCase()
      .trim();
  }, []);

  // Updated getClientFact: Returns split metrics for precise handling
  const getClientFact = useCallback((client: MapPoint): { inPeriod: number, undated: number, source: 'daily'|'monthly'|'undated'|'none' } => {
    const fStart = toDayKey(effectiveStart);
    const fEnd = toDayKey(effectiveEnd);
    const hasFilter = Boolean(fStart || fEnd);

    // 1. Try Daily Precision first (Highest Accuracy)
    if (client.dailyFact && Object.keys(client.dailyFact).length > 0) {
        let sum = 0;
        for (const [dayKey, val] of Object.entries(client.dailyFact)) {
            if (dayKey === 'unknown') continue;
            const dk = toDayKey(dayKey);
            if (!dk) continue;

            if (hasFilter) {
                if (fStart && dk < fStart) continue;
                if (fEnd && dk > fEnd) continue;
            }
            sum += (val as number) || 0;
        }
        return { inPeriod: sum, undated: 0, source: 'daily' };
    }

    // 2. Fallback to Monthly (Low Accuracy for partial months)
    if (client.monthlyFact && Object.keys(client.monthlyFact).length > 0) {
        let sum = 0;
        const startMonth = fStart ? fStart.slice(0, 7) : null;
        const endMonth = fEnd ? fEnd.slice(0, 7) : null;

        for (const [monthKey, val] of Object.entries(client.monthlyFact)) {
             if (monthKey === 'unknown') continue;
             const mk = monthKey.length > 7 ? monthKey.slice(0, 7) : monthKey;
             
             if (hasFilter) {
                 if (startMonth && mk < startMonth) continue;
                 if (endMonth && mk > endMonth) continue;
             }
             sum += (val as number) || 0;
        }
        return { inPeriod: sum, undated: 0, source: 'monthly' };
    }

    // 3. No temporal data
    const raw = client.fact || 0;
    if (hasFilter) {
        // Filter is active but client has no dates.
        // inPeriod is 0 because we don't know the date.
        // undated gets the value. 
        return { inPeriod: 0, undated: raw, source: 'undated' };
    }
    
    // No filter: Undated data matches the "all time" view (effectively inPeriod)
    return { inPeriod: raw, undated: 0, source: 'undated' };

  }, [effectiveStart, effectiveEnd, toDayKey]);

  // 1. Total Universe
  const totalClientKeys = useMemo(() => {
      const set = new Set<string>();
      props.uploadedData?.forEach(row => {
          row.clients.forEach(c => { 
              const k = getSafeKey(c);
              if (k) set.add(k); 
          });
      });
      return set;
  }, [props.uploadedData, getSafeKey]);

  // 2. Effective Universe (Filtered by Date, RM)
  // Defaults to "Soft Mode" - includes undated records if they exist
  const effectiveUniverseKeys = useMemo(() => {
    const set = new Set<string>();
    if (props.uploadedData) {
      props.uploadedData.forEach((row) => {
        // RM Filter Check
        if (props.selectedRm && row.rm !== props.selectedRm) return;

        row.clients.forEach((c) => {
          const { inPeriod, undated } = getClientFact(c);
          const effectiveFact = inPeriod + undated;
          
          if (effectiveFact > MIN_FACT) {
              const k = getSafeKey(c);
              if (k) set.add(k);
          }
        });
      });
    }
    return set;
  }, [props.uploadedData, getClientFact, props.selectedRm, getSafeKey]);

  // 3. Period Universe (Filtered by Date, IGNORING RM)
  const periodUniverseKeys = useMemo(() => {
    const set = new Set<string>();
    if (props.uploadedData) {
      props.uploadedData.forEach((row) => {
        // NO RM Filter Check
        row.clients.forEach((c) => {
          const { inPeriod, undated } = getClientFact(c);
          const effectiveFact = inPeriod + undated;
          
          if (effectiveFact > MIN_FACT) {
              const k = getSafeKey(c);
              if (k) set.add(k);
          }
        });
      });
    }
    return set;
  }, [props.uploadedData, getClientFact, getSafeKey]);

  const totalUniqueCount = totalClientKeys.size;
  const effectiveUniqueCount = effectiveUniverseKeys.size;
  const periodUniqueCount = periodUniverseKeys.size;
  const displayActiveCount = props.uploadedData ? totalUniqueCount : props.activeClientsCount;

  const healthScore = useMemo(() => {
    if (displayActiveCount === 0) return 0;
    const penalty = props.unidentifiedCount * 5;
    const baseScore = 100;
    return Math.max(0, Math.round(baseScore - (penalty / displayActiveCount) * 100));
  }, [displayActiveCount, props.unidentifiedCount]);

  const healthTone = healthScore > 80 ? 'lime' : healthScore > 50 ? 'blue' : 'red';

  const outliers = useMemo<OutlierItem[]>(() => {
    if (!props.uploadedData || props.uploadedData.length === 0) return [];

    const relevantData = props.uploadedData
      .filter(row => !props.selectedRm || row.rm === props.selectedRm) // Apply RM Filter
      .map((row) => {
        const activeClients = row.clients
          .map((client) => {
             const { inPeriod, undated } = getClientFact(client);
             const fact = inPeriod + undated;
             const k = getSafeKey(client);
             return { ...client, key: k, fact };
          })
          .filter((c) => (c.fact || 0) > MIN_FACT);

        const rowFact = activeClients.reduce((sum, c) => sum + (c.fact || 0), 0);

        return {
            ...row,
            clients: activeClients,
            fact: rowFact,
        };
      })
      .filter((row) => row.fact > MIN_FACT);

    return detectOutliers(relevantData);
  }, [props.uploadedData, getClientFact, props.selectedRm, getSafeKey]);

  const channelStats = useMemo(() => {
    if (!props.uploadedData || props.uploadedData.length === 0) return [];
    const acc: Record<string, { uniqueKeys: Set<string>; volume: number }> = {};
    const globalUniqueKeys = new Set<string>();

    props.uploadedData.forEach((row) => {
      // Apply RM Filter
      if (props.selectedRm && row.rm !== props.selectedRm) return;

      row.clients.forEach((client) => {
        // Direct calculation instead of pre-filtered Set lookup for robustness
        const { inPeriod, undated } = getClientFact(client);
        const effectiveFact = inPeriod + undated;

        if (effectiveFact <= MIN_FACT) return;

        const type = client.type || 'Не определен';
        if (!acc[type]) acc[type] = { uniqueKeys: new Set(), volume: 0 };

        const k = getSafeKey(client);
        acc[type].uniqueKeys.add(k);
        acc[type].volume += effectiveFact;
        globalUniqueKeys.add(k);
      });
    });

    const totalPeriodCount = globalUniqueKeys.size;
    return Object.entries(acc)
      .map(([name, data]) => ({
        name,
        count: data.uniqueKeys.size,
        volume: data.volume,
        volumeTons: data.volume / 1000,
        percentage: totalPeriodCount > 0 ? (data.uniqueKeys.size / totalPeriodCount) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [props.uploadedData, getClientFact, props.selectedRm, getSafeKey]);

  const groupedChannelData = useMemo(() => {
    if (!selectedChannel || !props.uploadedData) return null;
    const uniqueClientsInChannel = new Map<string, MapPoint & { totalFact: number }>();
    const safeLower = (val: any) => (val || '').toString().toLowerCase();

    props.uploadedData.forEach((row) => {
      // Apply RM Filter
      if (props.selectedRm && row.rm !== props.selectedRm) return;

      row.clients.forEach((c) => {
        // Direct calculation instead of pre-filtered Set lookup
        const { inPeriod, undated } = getClientFact(c);
        const effectiveFact = inPeriod + undated;

        if (effectiveFact <= MIN_FACT) return;

        if ((c.type || 'Не определен') === selectedChannel) {
          const search = channelSearchTerm.toLowerCase();
          if (
            !search ||
            safeLower(c.name).includes(search) ||
            safeLower(c.address).includes(search) ||
            safeLower(c.rm).includes(search)
          ) {
            const k = getSafeKey(c);
            if (!uniqueClientsInChannel.has(k)) {
              uniqueClientsInChannel.set(k, { ...c, key: k, totalFact: 0 });
            }
            const existing = uniqueClientsInChannel.get(k)!;
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
  }, [selectedChannel, props.uploadedData, channelSearchTerm, getClientFact, props.selectedRm, getSafeKey]);

  const rowsToDisplay = useMemo(() => {
    if (props.processingState.isProcessing) {
      return (props.processingState.totalRowsProcessed || 0).toLocaleString('ru-RU');
    }
    return displayActiveCount.toLocaleString('ru-RU');
  }, [props.processingState.isProcessing, props.processingState.totalRowsProcessed, displayActiveCount]);

  return (
    <div className="space-y-6">
      {/* Header with New TopBar */}
      <Motion delayMs={0}>
        <div data-tour="topbar">
            <TopBar
                title="ADAPTA"
                subtitle={dynamicSubtitle}
                startDate={props.startDate}
                endDate={props.endDate}
                onStartDateChange={props.onStartDateChange}
                onEndDateChange={props.onEndDateChange}
                isLoading={props.processingState.isProcessing}
                onCloudSync={() => {
                    setActiveTab('ingest');
                    if (props.onForceUpdate) props.onForceUpdate();
                }}
                extraControls={
                   <div className="flex items-center gap-2">
                       {/* RM Selector */}
                       {availableRMs.length > 0 && props.onRmChange && (
                           <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 h-9">
                              <FilterIcon />
                              <select 
                                 value={props.selectedRm || ''} 
                                 onChange={(e) => props.onRmChange!(e.target.value)}
                                 className="bg-transparent text-sm text-slate-800 outline-none w-[160px] cursor-pointer"
                              >
                                 <option value="">Все менеджеры</option>
                                 {availableRMs.map(rm => (
                                     <option key={rm} value={rm}>{rm}</option>
                                 ))}
                              </select>
                           </div>
                       )}
                   </div>
                }
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
                    disabled={displayActiveCount === 0}
                    className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'hygiene' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50'}`}
                >
                    Качество (DQ)
                </button>
            </div>
        </div>
      </Motion>

      {/* Logic: Database exists but Filter hides everything */}
      {displayActiveCount > 0 && effectiveUniqueCount === 0 && (
        <Motion delayMs={80}>
          <EmptyState
            kind="noResults"
            tone="info"
            title="По выбранному периоду данных нет"
            description={`В базе ${displayActiveCount.toLocaleString()} клиентов, но данных по ним не найдено (даже без дат).`}
            action={
              <div className="flex gap-2">
                  <button
                    onClick={() => { 
                        props.onStartDateChange(''); 
                        props.onEndDateChange(''); 
                        if (props.onRmChange) props.onRmChange('');
                    }}
                    className="rounded-2xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-[0_14px_40px_rgba(99,102,241,0.22)] hover:from-indigo-500 hover:to-sky-400 transition-all"
                  >
                    Сбросить фильтры
                  </button>
              </div>
            }
          />
        </Motion>
      )}

      {activeTab === 'ingest' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left stack */}
          <div className="space-y-6">
            <Motion delayMs={100}>
              {/* Cloud Engine card - White Theme */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/70 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Облачный движок</h3>
                        <p className="text-xs text-slate-500 mt-1">Статус индекса и потоковой обработки</p>
                    </div>
                    {props.processingState.isProcessing ? (
                        <div className="flex items-center gap-2 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200">
                             <LoaderIcon className="w-3 h-3 text-indigo-500 animate-spin" />
                             <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Streaming</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
                             <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Online</span>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                        {props.dbStatus === 'ready' ? <CheckIcon /> : <InfoIcon />}
                    </div>
                    <div>
                         <div className="text-base font-bold text-slate-900 leading-tight">
                            {props.dbStatus === 'ready' ? 'Live Index: OK' : 'No Index Found'}
                         </div>
                         <div className="text-xs text-slate-500 mt-1">
                            {displayActiveCount.toLocaleString('ru-RU')} уник. ТТ
                         </div>
                    </div>
                </div>

                {props.processingState.isProcessing && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">
                            <span>Прогресс</span>
                            <span className="text-indigo-600">{Math.round(props.processingState.progress)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-500" style={{ width: `${props.processingState.progress}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 italic truncate">{props.processingState.message}</p>
                    </div>
                )}
              </div>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <StatTile
                        label={props.processingState.isProcessing ? "Обработано строк" : "Клиентов (в периоде)"}
                        value={props.processingState.isProcessing ? rowsToDisplay : periodUniqueCount.toLocaleString('ru-RU')}
                        accent="neutral"
                        footnote={
                          props.processingState.isProcessing
                            ? 'Чтение снимка…'
                            : (effectiveStart || effectiveEnd 
                                    ? (props.selectedRm ? `В выборке (РМ): ${effectiveUniqueCount.toLocaleString()}` : `В выборке: ${effectiveUniqueCount.toLocaleString()}`)
                                    : 'За все время')
                        }
                      />
                      <StatTile
                        label="Уникальных ТТ"
                        value={displayActiveCount.toLocaleString('ru-RU')}
                        accent="lime"
                        footnote="Гео-объектов (База)"
                      />

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
                    title={props.selectedRm ? `Структура каналов сбыта: ${props.selectedRm}` : "Структура каналов сбыта (в периоде)"}
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
                          onBarClick={(name) => setSelectedChannel(name)}
                        />
                      </div>

                      {/* List View inside the card */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-slate-100 pt-6">
                        {channelStats.slice(0, 6).map((stat) => (
                          <button
                            key={stat.name}
                            onClick={() => setSelectedChannel(stat.name)}
                            className="text-left rounded-2xl border border-slate-200/70 bg-white/50 p-4 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,23,42,0.06)] active:scale-[0.98] transition-all flex flex-col justify-between group"
                          >
                            <div className="flex justify-between items-start w-full mb-3">
                                <div className="t-label truncate pr-2 max-w-[70%]" title={stat.name}>{stat.name}</div>
                                <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-colors">
                                  {stat.percentage.toFixed(1)}%
                                </div>
                            </div>
                            
                            <div className="mb-3">
                                <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight leading-none">
                                  {stat.count.toLocaleString('ru-RU')}
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium mt-1">активных точек</div>
                            </div>
                            
                            <div className="mt-auto flex items-center gap-2 pt-3 border-t border-slate-100 group-hover:border-indigo-50 transition-colors">
                                <div className="text-emerald-500">
                                   <FactIcon small />
                                </div>
                                <div className="text-xs font-mono font-bold text-emerald-700">
                                   {new Intl.NumberFormat('ru-RU').format(Math.round(stat.volume))} <span className="text-[10px] font-sans text-emerald-500 font-normal">кг</span>
                                </div>
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
                        description={props.selectedRm ? "Нет продаж для выбранного менеджера в этот период." : "Загрузите данные или сбросьте фильтры периода."}
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
