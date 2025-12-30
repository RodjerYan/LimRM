

export interface AggregatedDataRow {
    key: string;
    rm: string;
    clientName: string;
    brand: string;
    packaging: string;
    city: string; 
    region: string;
    fact: number;
    potential: number;
    growthPotential: number;
    growthPercentage: number;
    potentialClients?: PotentialClient[];
    clients: MapPoint[];
    planMetric?: PlanMetric;
    costToServeScore?: number;
    eComShare?: number;
}

export type MapPointStatus = 'match' | 'potential';

export interface MapPoint {
    key: string;
    lat?: number;
    lon?: number;
    status: MapPointStatus;
    name: string;
    address: string;
    city: string;
    region: string;
    rm: string;
    brand: string;
    packaging: string;
    type: string;
    contacts?: string;
    isCached?: boolean;
    isGeocoding?: boolean;
    geocodingError?: string;
    originalRow: any;
    fact?: number;
    abcCategory?: 'A' | 'B' | 'C';
    lastUpdated?: number;
    comment?: string;
    churnRisk?: 'high' | 'medium' | 'low';
}

export interface EnrichedParsedAddress {
    region: string;
    city: string;
    finalAddress: string;
}

export interface PotentialClient {
    name: string;
    address: string;
    type: string;
    lat?: number;
    lon?: number;
}

export interface OkbDataRow {
    [key: string]: any;
    'Наименование': string;
    'Юридический адрес'?: string;
    'Регион'?: string;
    'Город'?: string;
    'Вид деятельности'?: string;
    'ИНН'?: string;
    'Статус'?: string;
    'Контакты'?: string;
    lat?: number;
    lon?: number;
}

export interface UnidentifiedRow {
    rm: string;
    rowData: any;
    originalIndex: number;
}

export interface FilterOptions {
    rms: string[];
    brands: string[];
    packagings: string[];
    regions: string[];
}

export interface FilterState {
    rm: string;
    brand: string[];
    packaging: string[];
    region: string[];
}

export interface SummaryMetrics {
    totalFact: number;
    totalPotential: number;
    totalGrowth: number;
    totalClients: number;
    totalActiveClients: number;
    averageGrowthPercentage: number;
    topPerformingRM: {
        name: string;
        value: number;
    };
    channelCounts: Record<string, number>;
}

export interface NotificationMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

export type OkbStatus = {
    status: 'idle' | 'loading' | 'processing' | 'ready' | 'error';
    message: string | null;
    timestamp?: string;
    rowCount?: number;
    coordsCount?: number;
};

export type WorkerProgressPayload = {
    percentage: number;
    message: string;
    isBackground?: boolean;
};

export type WorkerResultPayload = {
    aggregatedData: AggregatedDataRow[];
    unidentifiedRows: UnidentifiedRow[];
    okbRegionCounts: { [key: string]: number };
    dateRange?: string; 
    totalRowsProcessed: number;
};

export type WorkerErrorPayload = string;

export type WorkerBackgroundMessage = 
    | { type: 'save_cache_batch', payload: { rmName: string, rows: { address: string }[], batchId: string } }
    | { type: 'start_geocoding_tasks', payload: { tasks: { [rmName: string]: string[] } } };

export type WorkerStreamInit = {
    type: 'result_init';
    payload: {
        okbRegionCounts: { [key: string]: number };
        dateRange?: string;
        totalUnidentified: number;
    }
};

export type WorkerStreamChunk = 
    | {
        type: 'result_chunk_aggregated';
        payload: { data: AggregatedDataRow[]; totalProcessed: number };
      }
    | {
        type: 'result_chunk_unidentified';
        payload: UnidentifiedRow[];
      };

export type WorkerStreamCheckpoint = {
    type: 'CHECKPOINT';
    payload: WorkerResultPayload;
};

export type WorkerStreamFinish = {
    type: 'result_finished';
    payload: WorkerResultPayload;
};

export type WorkerInputInit = {
    type: 'INIT_STREAM';
    payload: {
        okbData: OkbDataRow[];
        cacheData: CoordsCache;
    };
};

export type WorkerInputChunk = {
    type: 'PROCESS_CHUNK';
    payload: {
        rawData: any[][];
        isFirstChunk: boolean;
        fileName?: string;
    };
};

export type WorkerInputFinalize = {
    type: 'FINALIZE_STREAM';
};

export type WorkerInputAck = {
    type: 'ACK';
    payload: {
        batchId: string;
    };
};

export type WorkerMessage =
    | { type: 'progress', payload: WorkerProgressPayload }
    | { type: 'error', payload: WorkerErrorPayload }
    | { type: 'background', payload: WorkerBackgroundMessage }
    | WorkerStreamInit
    | WorkerStreamChunk
    | WorkerStreamCheckpoint
    | WorkerStreamFinish;

export type CoordsCache = Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>;

export interface GrowthFactors {
    base: number;
    share: number;
    width: number;
    velocity: number;
    acquisition: number;
}

export interface GrowthDetails {
    mySku: number;
    globalSku: number;
    myVelocity: number;
    globalVelocity: number;
    marketShare: number; 
    rmEfficiencyRatio: number; 
}

export interface PlanMetric {
    name: string; 
    fact: number;
    plan: number;
    growthPct: number; 
    marketShare?: number; 
    activeCount?: number; 
    totalCount?: number; 
    brands?: PlanMetric[]; 
    packagingDetails?: AggregatedDataRow[]; 
    factors?: GrowthFactors;
    details?: GrowthDetails; 
}

export interface RMMetrics {
    rmName: string;
    totalClients: number;
    totalOkbCount: number; 
    totalFact: number;
    totalPotential: number;
    avgFactPerClient: number;
    marketShare: number; 
    countA: number;
    countB: number;
    countC: number;
    factA: number; 
    factB: number; 
    factC: number; 
    recommendedGrowthPct: number; 
    nextYearPlan: number;
    regions: PlanMetric[];
    brands: PlanMetric[];
    avgSkuPerClient?: number;
    avgSalesPerSku?: number;
    globalAvgSku?: number;
    globalAvgSalesSku?: number;
}

export interface PlanningContext {
    baseRate: number;
    globalAvgSku: number;
    globalAvgSales: number;
    riskLevel: 'low' | 'medium' | 'high'; 
}

export interface FileProcessingState {
    isProcessing: boolean;
    progress: number;
    message: string;
    fileName: string | null;
    backgroundMessage: string | null;
    startTime: number | null;
    totalRowsProcessed?: number;
}

export interface CloudLoadParams {
    startYear: string;
    startMonth: number;
    endYear: string;
    endMonth: number;
}

export interface MarketData {
    regionName: string;
    petDensityIndex: number; 
    competitorDensityIndex: number; 
    eComPenetration: number; 
    avgOwnerAge: number; 
}

// Added SalesLeagueMember interface to support gamification features
export interface SalesLeagueMember {
    rank: number;
    name: string;
    score: number;
    achievementPct: number;
    volume: number;
    trend: 'up' | 'down' | 'flat';
    badge?: 'champion' | 'rising_star' | 'risk' | 'grinder';
}
