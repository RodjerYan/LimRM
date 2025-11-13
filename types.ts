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
    clients: string[]; // List of individual client names/addresses in the group
}

export type MapPointStatus = 'exact' | 'approximate' | 'region' | 'geocoded';

export interface MapPoint {
    key: string;
    lat?: number;
    lon?: number;
    accuracy: MapPointStatus;
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

export interface PotentialClient {
    name: string;
    address: string;
    type: string;
    lat?: number;
    lon?: number;
}

// This type now represents a row from the NEW Google Sheet
export interface OkbDataRow {
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
    lat?: number;
    lon?: number;
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

// Deprecated, but kept for compatibility with DetailsModal prop type
export type OkbStatus = {
    status: 'idle' | 'loading' | 'processing' | 'ready' | 'error';
    message: string | null;
    timestamp?: string;
    rowCount?: number;
    coordsCount?: number;
} | null;
