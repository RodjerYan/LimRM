export interface RawDataRow {
  [key: string]: string | number;
}

export interface LoadingState {
  status: 'idle' | 'reading' | 'processing' | 'geocoding' | 'done' | 'error';
  progress: number;
  text: string;
  etr?: string; // Estimated Time Remaining
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

export interface PotentialClient {
  name: string;
  address: string;
  type: string;
  lat?: number;
  lon?: number;
}

export interface AggregatedDataRow {
  key: string;
  rm: string;
  city: string;
  brand: string;
  fact: number;
  potential: number;
  growthPotential: number;
  growthRate: number;
  potentialTTs: number;
  potentialClients: PotentialClient[];
  cityCenter?: { lat: number, lon: number };
}

export interface ProcessedData {
  aggregatedData: AggregatedDataRow[];
  filterOptions: FilterOptions;
  totalFact: number;
  totalPotential: number;
}

export interface WorkerMessage {
  type: 'progress' | 'result' | 'error';
  payload: any;
}

export interface NotificationMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface RMPerformanceAnalysis {
  rmName: string;
  fact: number;
  potential: number;
  growth: number;
  realizationRate: number;
  category: 'Лидер рынка' | 'Стабильный рост' | 'Высокий потенциал';
  recommendedIncrease: number;
  justification: string;
}