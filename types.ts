

export interface RawDataRow {
    rm: string;
    brand: string;
    fullAddress: string;
    city: string;
    fact: number;
}

export interface PotentialClient {
    name: string;
    address: string;
    phone: string;
    type: string;
    lat?: number;
    lon?: number;
}

export interface ProcessedDataRow extends RawDataRow {
    potential: number;
    growthPotential: number;
    growthRate: number;
    potentialTTs: number;
    potentialClients: PotentialClient[];
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