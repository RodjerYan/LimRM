
export interface RawDataRow {
    [key: string]: any; // Allows for flexible column names from Excel
}

export interface OkbDataRow {
    'Наименование полное': string;
    'Юридический адрес': string;
    'Вид деятельности (ОКВЭД)': string;
    'Широта': number | null;
    'Долгота': number | null;
    'Регион': string;
}

export interface AggregatedDataRow {
    key: string; // Unique key for react lists, e.g., clientName-brand
    rm: string;
    clientName: string;
    brand: string;
    city: string;
    region: string;
    fact: number;
    potential: number;
    growthPotential: number;
    growthPercentage: number;
}

export interface WorkerMessage {
    type: 'progress' | 'result' | 'error';
    payload: any;
}

export interface WorkerProgress {
    percentage: number;
    message: string;
}

export interface OkbStatus {
    lastUpdated: string | null;
    status: 'idle' | 'updating' | 'ready' | 'error';
    message?: string;
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
    lat: number | null;
    lon: number | null;
}

export interface NotificationMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

export interface SummaryMetrics {
    totalFact: number;
    totalPotential: number;
    totalGrowth: number;
    totalClients: number;
    averageGrowthPercentage: number;
    topPerformingRM: { name: string; value: number };
}
