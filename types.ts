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
    cityCenter?: { lat: number; lon: number; };
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
    totalMarketTTs: number;
    potentialClients: PotentialClient[];
    cityCenter?: { lat: number; lon: number; };
    activeTT: number;
    newPlan?: number;
}

export interface LoadingState {
    status: 'idle' | 'reading' | 'fetching' | 'aggregating' | 'analyzing' | 'done' | 'error';
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
    totalNewPlan: number;
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

export interface AiAnalysisResult {
    summary: {
        total_sales_kg: string;
        total_sales_amount?: string; 
        unique_rms: number;
        unique_brands: number;
        unique_regions: number;
    };
    leaders: {
        top_managers: { name: string; value: string }[];
        top_brands: { name: string; value: string }[];
        top_regions: { name: string; value: string }[];
    };
    insights: string[];
}