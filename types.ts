export interface AggregatedDataRow {
    key: string;
    rm: string;
    groupName: string; // Will hold the RM's name or Client Name
    clientName: string; // Explicitly add client name for table display
    brand: string; // Can be an aggregation of brands
    city: string; 
    fact: number;
    potential: number;
    growthPotential: number;
    growthPercentage: number;
    potentialClients: PotentialClient[];
    currentClients: PotentialClient[];
    clients: string[]; // List of individual client addresses in the group
}

export interface ParsedAddress {
    region: string;
    city: string;
}

export interface PotentialClient {
    name: string;
    address: string;
    type: string;
    lat?: number;
    lon?: number;
}

export interface OkbDataRow {
    [key:string]: any;
    'Наименование': string;
    'Юридический адрес'?: string;
    'Регион'?: string;
    'Город'?: string;
    'Вид деятельности'?: string;
    'ИНН'?: string;
    'Статус'?: string;
    'Широта'?: number;
    'Долгота'?: number;
}

export interface FilterOptions {
    rms: string[];
    brands: string[];
    cities: string[];
}

export interface FilterState {
    rm: string;
    brand: string[];
    city: string[];
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