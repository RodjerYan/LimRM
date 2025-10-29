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
    clients?: string[]; // List of individual client names/addresses in the group
}

export interface ParsedAddress {
    country: string;
    region: string; // FIX: Changed from `string | null` to `string` to match the parser's implementation.
    city: string | null;
    street: string | null;
    house: string | null;
    postalCode: string | null;
    lat: number | null;
    lon: number | null;
    confidence: number;
    source: 'explicit' | 'postal' | 'city_lookup' | 'fuzzy' | 'unknown';
    ambiguousCandidates: string[];
    status?: 'определён' | 'не определён';
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
};

// Types for the Web Worker communication
export type WorkerProgressPayload = {
    percentage: number;
    message: string;
};
export type WorkerResultPayload = AggregatedDataRow[];
export type WorkerErrorPayload = string;

export type WorkerMessage =
    | { type: 'progress', payload: WorkerProgressPayload }
    | { type: 'result', payload: WorkerResultPayload }
    | { type: 'error', payload: WorkerErrorPayload };