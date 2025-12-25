
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

export type WorkerResultPayload = {
    aggregatedData: AggregatedDataRow[];
    unidentifiedRows: UnidentifiedRow[];
    okbRegionCounts: { [key: string]: number };
    dateRange?: string; 
    totalRowsProcessed: number;
};

export type WorkerMessage =
    | { type: 'progress', payload: { percentage: number, message: string } }
    | { type: 'error', payload: string }
    | { type: 'result_finished', payload: WorkerResultPayload };

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
    eCom?: number;
    factors?: GrowthFactors;
    details?: GrowthDetails; 
    brands?: PlanMetric[];
}

export interface PlanningContext {
    baseRate: number;
    globalAvgSku: number;
    globalAvgSales: number;
    riskLevel: 'low' | 'medium' | 'high';
}

export interface RMMetrics {
    rmName: string;
    totalClients: number;
    totalOkbCount: number; 
    totalFact: number;
    totalPotential: number;
    marketShare: number; 
    countA: number;
    countB: number;
    countC: number;
    recommendedGrowthPct: number; 
    nextYearPlan: number;
    regions: PlanMetric[];
    brands: PlanMetric[];
    factA: number;
    factB: number;
    factC: number;
    avgFactPerClient: number;
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
    year: string;
    quarter?: number; 
    month?: number;   
}

export interface MarketData {
    regionName: string;
    petDensityIndex: number; 
    competitorDensityIndex: number; 
    eComPenetration: number; 
    avgOwnerAge: number; 
}

export interface SalesLeagueMember {
    rank: number;
    name: string;
    score: number;
    achievementPct: number;
    volume: number;
    trend: 'up' | 'down' | 'flat';
    badge?: 'champion' | 'rising_star' | 'grinder' | 'risk';
}
