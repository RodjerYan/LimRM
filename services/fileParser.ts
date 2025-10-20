import { RawDataRow } from '../types';

// --- START Location Normalization ---
// Fix: Export CITY_TO_REGION_MAP to make it accessible to other modules.
export const CITY_TO_REGION_MAP: Record<string, string> = {
    // Federal Cities (they are their own region)
    'москва': 'Москва',
    'санкт-петербург': 'Санкт-Петербург',
    'севастополь': 'Севастополь',
    
    // Republics
    'майкоп': 'Республика Адыгея',
    'горно-алтайск': 'Республика Алтай',
    'уфа': 'Республика Башкортостан',
    'стерлитамак': 'Республика Башкортостан',
    'салават': 'Республика Башкортостан',
    'улан-удэ': 'Республика Бурятия',
    'махачкала': 'Республика Дагестан',
};
