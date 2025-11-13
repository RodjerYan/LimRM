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
    clients: string[]; // List of individual client names/addresses in the group
}

export type MapPointStatus = 'match';

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
}

export interface ParsedAddress {
    region: string;
    city: string;
}

export interface AkbRow {
    [key: string]: any;
    'Дистрибьютор'?: string;
    'Торговая марка'?: string;
    'Уникальное наименование товара'?: string;
    'Фасовка'?: string;
    'Вес, кг'?: string | number;
    'Месяц'?: string;
    'Адрес ТТ LimKorm'?: string;
    'Канал продаж'?: string;
    'РМ'?: string;
    lat?: number | string;
    lon?: number | string;
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
    totalClients: number; // This represents the number of groups
    totalActiveClients: number; // This is the total number of unique trade points
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

// Types for the Web Worker communication
export type WorkerProgressPayload = {
    percentage: number;
    message: string;
};
export type WorkerResultPayload = {
    aggregatedData: AggregatedDataRow[];
    plottableActiveClients: MapPoint[];
};
export type WorkerErrorPayload = string;

export type WorkerMessage =
    | { type: 'progress', payload: WorkerProgressPayload }
    | { type: 'result', payload: WorkerResultPayload }
    | { type: 'error', payload: WorkerErrorPayload };