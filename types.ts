export interface PotentialClient {
    name: string;
    address: string;
    phone: string;
    type: string;
    lat?: number;
    lon?: number;
}

export interface AggregatedDataRow {
    rm: string;
    brand: string;
    city: string;
    fact: number;
    potential: number;
    growthPotential: number;
    growthRate: number;
    potentialTTs: number;
    potentialClients: PotentialClient[];
}

// FIX: Added missing RawDataRow interface to resolve compilation error in services/fileParser.ts
export interface RawDataRow {
    rm: string;
    brand: string;
    city: string;
    fact: number;
    fullAddress: string;
}

export interface LoadingState {
    status: 'idle' | 'reading' | 'fetching' | 'aggregating' | 'done' | 'error';
    progress: number;
    text: string;
    etr: string;
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

export interface Metrics {
    totalFact: number;
    totalPotential: number;
    totalGrowthPotential: number;
    totalGrowthRate: number;
    avgPlanIncrease: number;
}

export interface NotificationMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

export type SortConfig = {
    key: keyof AggregatedDataRow;
    direction: 'ascending' | 'descending';
} | null;

// This type now represents the expected structure of a row from Google Sheets.
// It should contain all necessary data, including what was previously in the user's file.
export interface OKBDataRow {
    'Страна': string;
    'Субъект': string;
    'Город или населенный пункт': string;
    'Категория': string;
    'Наименование': string;
    'Адрес': string;
    'Контакты': string;
    'Дата обновления базы': string;
    'Широта'?: string;
    'Долгота'?: string;
    // Optional fields that are now expected from the master Google Sheet
    'РМ'?: string;
    'Бренд'?: string;
    'Факт (кг/ед)'?: string | number;
}