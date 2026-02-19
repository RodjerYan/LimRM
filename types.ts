
export interface AggregatedDataRow {
    __rowId: string; // IMMUTABLE ID for stable chunking/diffing
    _chunkIndex?: number; // STICKY CHUNK ID: Remembers which file this row belongs to
    key: string;
    rm: string;
    clientName: string;
    brand: string;
    packaging: string; // New field
    city: string; 
    region: string;
    fact: number;
    monthlyFact?: Record<string, number>; // Added: Sales volume broken down by month (YYYY-MM)
    dailyFact?: Record<string, number>; // Added: Sales volume broken down by day (YYYY-MM-DD)
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
    coordStatus?: 'pending' | 'confirmed' | 'invalid'; // Explicit status from DB
    geocodingError?: string; // New field: error message from external geocoder
    originalRow: any; // To hold the full original data row for detailed viewing
    fact?: number; // Sales volume for this specific point
    monthlyFact?: Record<string, number>; // Added: Sales volume broken down by month for this point
    dailyFact?: Record<string, number>; // Added: Sales volume broken down by day for this point
    potential?: number; // Potential volume for this specific point
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
    // Generated properties
    isDeleted?: boolean;
    comment?: string;
    changeHistory?: string[]; // Array of strings "Action by User at Time"
}

// NEW: Delta for Potential Points (Blue Points)
export interface InterestDelta {
    key: string; // normalized address + # + name
    type: 'delete' | 'comment';
    user: string;
    timestamp: number;
    reason?: string; // Mandatory for delete
    comment?: string;
}

export interface UnidentifiedRow {
    rm: string;
    rowData: any;
    originalIndex: number;
    rawArray?: any[]; // NEW: Stores the raw Excel row array to guarantee data visibility
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
    channelCounts: Record<string, number>; // Добавлено: количество ТТ по каналам
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
    totalProcessed?: number; // Added: Live row count update
};

export type WorkerResultPayload = {
    aggregatedData: AggregatedDataRow[];
    unidentifiedRows: UnidentifiedRow[];
    okbRegionCounts: { [key: string]: number };
    dateRange?: string; 
    totalRowsProcessed: number;
    processedFileIds?: string[]; // NEW: Track completed files
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
        totalUnidentified: number;
    }
};

// FIX: Updated WorkerStreamChunk to be a discriminated union to handle different payload shapes for different chunk types.
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

// --- NEW TYPES FOR INPUT (Streaming to Worker) ---
export type WorkerInputInit = {
    type: 'INIT_STREAM';
    payload: {
        okbData: OkbDataRow[];
        cacheData: CoordsCache;
        totalRowsProcessed?: number; // Added to support resuming
        restoredData?: AggregatedDataRow[]; // New: Allow restoring state from local data
        restoredUnidentified?: UnidentifiedRow[]; // New
        
        // Date Filtering
        startDate?: string;
        endDate?: string;
    };
};

export type WorkerInputChunk = {
    type: 'PROCESS_CHUNK';
    payload: {
        rawData: any[]; // Changed from any[][] to any[] to support Array of Objects
        isFirstChunk: boolean;
        fileName?: string;
        // NEW: Discriminator for processing logic
        objectKind?: 'POINT_SNAPSHOT' | 'RAW_ROWS'; 
        isObjectMode?: boolean; // Legacy/Backup flag
        progress?: number; // Main thread calculated progress percentage (0-100)
    };
};

export type WorkerInputRestore = {
    type: 'RESTORE_CHUNK';
    payload: {
        chunkData: any;
        progress?: number;
    };
};

// NEW: Support for full file processing in worker
export type WorkerInputFile = {
    type: 'PROCESS_FILE';
    payload: {
        fileBuffer: ArrayBuffer;
        fileName: string;
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
    | WorkerStreamFinish
    | WorkerInputFile
    | WorkerInputChunk
    | WorkerInputRestore
    | WorkerInputInit
    | WorkerInputFinalize;

export type CoordsCache = Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string; coordStatus?: string }[]>;

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
// FIX: Added missing type definition for UpdateJobStatus.
export interface UpdateJobStatus {
    status: 'pending' | 'processing' | 'completed' | 'error';
    message: string;
    progress: number;
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
    catShare: number; // Percentage of cats (0-100)
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

// --- QUEUE ACTION TYPES ---
export type ActionQueueItem = 
    | { 
        type: 'UPDATE_ADDRESS'; 
        id: string; // Unique ID for queue management
        payload: { 
            rmName: string; 
            oldAddress: string; 
            newAddress: string; 
            comment?: string; 
            lat?: number; 
            lon?: number;
            skipHistory?: boolean; // NEW: Flag to suppress Google Sheet history logging
        };
        retryCount: number;
      }
    | { 
        type: 'DELETE_ADDRESS'; 
        id: string;
        payload: { 
            rmName: string; 
            address: string; 
        };
        retryCount: number;
      };

// --- DELTA SYSTEM TYPES ---
export interface DeltaItem {
    type: 'update' | 'delete';
    key: string; // The row key (or address if key absent)
    rm: string; // To help identifying
    payload?: Partial<MapPoint>; // Only changed fields
    timestamp: number;
}

// --- ANALYTICS ENGINE TYPES ---

export type ActionType = 'churn' | 'activation' | 'growth' | 'data_fix';

export interface SuggestedAction {
    clientId: string;
    clientName: string;
    address: string;
    rm: string;
    type: ActionType;
    priorityScore: number;
    reason: string;
    recommendedStep: string;
    fact: number;
    potential: number;
}

export type ChurnRiskLevel = 'OK' | 'Monitor' | 'High' | 'Critical';

export interface ChurnMetric {
    clientId: string;
    clientName: string;
    address: string;
    rm: string;
    riskScore: number;
    riskLevel: ChurnRiskLevel;
    daysSinceLastOrder: number;
    avgOrderGap: number;
    volumeDropPct: number;
    fact: number;
}

export interface CoverageMetric {
    region: string;
    activeCount: number;
    okbCount: number;
    coveragePct: number;
    gap: number;
    priorityScore: number;
}

// --- TASK MANAGEMENT (Snooze/Delete) ---
export interface ProcessedTask {
    id: string; // Unique ID (e.g. clientId)
    targetId: string; // To match against NBA/Churn clientIds
    targetName: string; // For display in history
    type: 'delete' | 'snooze';
    reason: string;
    timestamp: number; // When action was taken
    restoreDeadline?: number; // For deleted items (30 days from timestamp)
    snoozeUntil?: number; // For snoozed items
    user?: string; // Who performed action
}
