
export interface AggregatedDataRow {
    key: string;
    rm: string;
    clientName: string;
    brand: string;
    packaging: string; // New field
    city: string; 
    region: string;
    fact: number;
    potential: number;
    growthPotential: number;
    growthPercentage: number;
    potentialClients?: PotentialClient[];
    clients: MapPoint[]; // List of individual client objects in the group
    planMetric?: PlanMetric; // Stores the detailed plan calculation for this specific row
    
    // New Strategic Metrics
    costToServeScore?: number; // 1-10 scale
    eComShare?: number; // Estimated % of online sales in this segment
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
    packaging: string; // New field
    type: string;
    contacts?: string;
    isCached?: boolean; // To distinguish between new and cached clients on the map
    isGeocoding?: boolean; // New flag: indicates if coordinates are currently being fetched
    originalRow: any; // To hold the full original data row for detailed viewing
    fact?: number; // Sales volume for this specific point
    abcCategory?: 'A' | 'B' | 'C'; // Classification based on sales volume
    lastUpdated?: number; // Timestamp of the last edit
    comment?: string; // User comments from Column E
    
    // Risk Analysis
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
    packagings: string[]; // New field
    regions: string[];
}

export interface FilterState {
    rm: string;
    brand: string[];
    packaging: string[]; // New field
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

// Types for the Web Worker communication
export type WorkerProgressPayload = {
    percentage: number;
    message: string;
    isBackground?: boolean;
};

// Deprecated single-payload type (kept for backward compat if needed, but not used in streaming)
export type WorkerResultPayload = {
    aggregatedData: AggregatedDataRow[];
    plottableActiveClients: MapPoint[];
    unidentifiedRows: UnidentifiedRow[];
    okbRegionCounts: { [key: string]: number };
    dateRange?: string; 
};

export type WorkerErrorPayload = string;

export type WorkerBackgroundMessage = 
    | { type: 'save_cache_batch', payload: { rmName: string, rows: { address: string }[], batchId: string } }
    | { type: 'start_geocoding_tasks', payload: { tasks: { [rmName: string]: string[] } } };

// --- NEW STREAMING TYPES FOR OUTPUT ---
export type WorkerStreamInit = {
    type: 'result_init';
    payload: {
        okbRegionCounts: { [key: string]: number };
        dateRange?: string;
        totalUnidentified: number; // Just count for progress
    }
};

export type WorkerStreamChunk = {
    type: 'result_chunk_aggregated' | 'result_chunk_unidentified';
    payload: any[]; // AggregatedDataRow[] or UnidentifiedRow[]
};

export type WorkerStreamFinish = {
    type: 'result_finished';
};

// --- NEW TYPES FOR INPUT (Streaming to Worker) ---
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

// Flow Control ACK
export type WorkerInputAck = {
    type: 'ACK';
    payload: {
        batchId: string;
    };
};

// Legacy input for file processing
export type WorkerInputLegacy = {
    file?: File;
    rawSheetData?: any[][];
    okbData: OkbDataRow[];
    cacheData: CoordsCache;
};

export type WorkerMessage =
    | { type: 'progress', payload: WorkerProgressPayload }
    | { type: 'result', payload: WorkerResultPayload } // Legacy
    | { type: 'error', payload: WorkerErrorPayload }
    | { type: 'background', payload: WorkerBackgroundMessage }
    | WorkerStreamInit
    | WorkerStreamChunk
    | WorkerStreamFinish;


// Type for the coordinate cache data structure from Google Sheets
export type CoordsCache = Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>;

// --- PLANNING ENGINE TYPES ---

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
    marketShare: number; // 0.0 - 1.0
    rmEfficiencyRatio: number; // 1.0 = average
}

// Sub-metric for detailed Region/Brand planning
export interface PlanMetric {
    name: string; // Region name or Brand name
    fact: number;
    plan: number;
    growthPct: number; // The specific or effective growth rate
    marketShare?: number; // Only applicable for regions
    activeCount?: number; // Active clients
    totalCount?: number; // Total potential clients (OKB) - only for regions
    brands?: PlanMetric[]; // Nested brand breakdown for this specific region
    packagingDetails?: AggregatedDataRow[]; // Breakdown by packaging for this brand
    
    // Breakdown of the calculation
    factors?: GrowthFactors;
    details?: GrowthDetails; // Context for the explanation
}

// Shared interface for RMMetrics used in Dashboard and Analysis
export interface RMMetrics {
    rmName: string;
    totalClients: number;
    totalOkbCount: number; // Stored matched OKB count
    totalFact: number;
    totalPotential: number;
    avgFactPerClient: number;
    marketShare: number; // Percentage (0-100) - Weighted Average
    countA: number;
    countB: number;
    countC: number;
    factA: number; // Total sales volume for category A
    factB: number; // Total sales volume for category B
    factC: number; // Total sales volume for category C
    recommendedGrowthPct: number; // Effective weighted growth
    nextYearPlan: number;
    // Detailed breakdowns
    regions: PlanMetric[];
    brands: PlanMetric[];
    
    // New Analytics Fields from Smart Logic
    avgSkuPerClient?: number;
    avgSalesPerSku?: number;
    globalAvgSku?: number;
    globalAvgSalesSku?: number;
}

// Planning Context for the Engine
export interface PlanningContext {
    baseRate: number;
    globalAvgSku: number;
    globalAvgSales: number;
    riskLevel: 'low' | 'medium' | 'high'; // Corresponds to "Black Day" scenarios
}

// New Interface for Global File Processing State
export interface FileProcessingState {
    isProcessing: boolean;
    progress: number;
    message: string;
    fileName: string | null;
    backgroundMessage: string | null;
    startTime: number | null;
}

// Interface for Cloud Loading Parameters
export interface CloudLoadParams {
    year: string;
    quarter?: number; // 1-4
    month?: number;   // 1-12
}

// --- NEW TYPES FOR UPGRADES ---

export interface MarketData {
    regionName: string;
    petDensityIndex: number; // 0-100 (100 = max density)
    competitorDensityIndex: number; // 0-100 (100 = high competition)
    eComPenetration: number; // % of sales online
    avgOwnerAge: number; // Average age of pet owners
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