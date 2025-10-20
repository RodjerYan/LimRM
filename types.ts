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
  structure?: {
    columns_detected?: string[];
    total_rows?: number;
  };
  summary?: {
    total_sales_amount?: string;
    total_sales_kg?: string;
    avg_by_manager?: { name: string; avg_kg: number; avg_amount: number }[];
    avg_by_region?: { region: string; avg_kg: number; avg_amount: number }[];
    avg_by_brand?: { brand: string; avg_kg: number; avg_amount: number }[];
  };
  leaders?: {
    top_managers?: string[];
    top_brands?: string[];
    top_regions?: string[];
  };
  forecast?: {
    method?: string;
    period?: string;
    predicted_growth_percent?: string;
    predicted_sales?: string;
  };
  insights?: string[];
}