
export interface AggregatedDataRow {
    key: string;
    rm: string;
    clientName: string;
    brand: string;
    city: string; 
    region: string;
    fact: number;
    potential: number;
    growthPotential: number;
    growthPercentage: number;
    potentialClients?: PotentialClient[];
    clients: MapPoint[]; // List of individual client objects in the group
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
    type: string;
    contacts?: string;
    isCached?: boolean; // To distinguish between new and cached clients on the map
    isGeocoding?: boolean; // New flag: indicates if coordinates are currently being fetched
    originalRow: any; // To hold the full original data row for detailed viewing
    fact?: number; // Sales volume for this specific point
    abcCategory?: 'A' | 'B' | 'C'; // Classification based on sales volume
    lastUpdated?: number; // Timestamp of the last edit
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
    regions: string[];
}

export interface FilterState {
    rm: string;
    brand: string[];
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
    type: 'success' | 'error' | 'info';
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
export type WorkerResultPayload = {
    aggregatedData: AggregatedDataRow[];
    plottableActiveClients: MapPoint[];
    unidentifiedRows: UnidentifiedRow[];
};
export type WorkerErrorPayload = string;

export type WorkerBackgroundMessage = 
    | { type: 'cache-update', payload: { rmName: string, rows: { address: string }[] } }
    | { type: 'geocode-request', payload: { rmName: string, addresses: string[] } }
    | { type: 'geocode-result', payload: { rmName: string, updates: { address: string, lat: number, lon: number }[] } };

export type WorkerMessage =
    | { type: 'progress', payload: WorkerProgressPayload }
    | { type: 'result', payload: WorkerResultPayload }
    | { type: 'error', payload: WorkerErrorPayload }
    | { type: 'background', payload: WorkerBackgroundMessage };


// Type for the coordinate cache data structure from Google Sheets
// Updated to include history string for redirect parsing in worker
export type CoordsCache = Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean }[]>;

// Sub-metric for detailed Region/Brand planning
export interface PlanMetric {
    name: string; // Region name or Brand name
    fact: number;
    plan: number;
    growthPct: number; // The specific or effective growth rate
    marketShare?: number; // Only applicable for regions
    activeCount?: number; // Active clients
    totalCount?: number; // Total potential clients (OKB) - only for regions
}

// Shared interface for RM Metrics used in Dashboard and Analysis
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
    recommendedGrowthPct: number; // Effective weighted growth
    nextYearPlan: number;
    // Detailed breakdowns
    regions: PlanMetric[];
    brands: PlanMetric[];
}
