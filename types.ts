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
    activeAddresses: string[];
    newPlan?: number;
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
    rm: string[];
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

export interface GeminiAnalysisResult {
  summary: {
    total_sales_kg: number;
    total_sales_amount: number;
    avg_by_manager: { name: string; avg_kg: number; avg_amount: number }[];
    avg_by_region: { name: string; avg_kg: number; avg_amount: number }[];
    avg_by_city: { name: string; avg_kg: number; avg_amount: number }[];
    avg_by_brand: { name: string; avg_kg: number; avg_amount: number }[];
  };
  top_managers: { name: string; value: number; metric: string }[];
  top_brands: { name: string; value: number; metric: string }[];
  top_cities: { name: string; value: number; metric: string }[];
  top_regions: { name: string; value: number; metric: string }[];
  insights: string[];
}
