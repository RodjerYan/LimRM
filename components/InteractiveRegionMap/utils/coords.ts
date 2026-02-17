
// Robust coordinate parser helper
export const parseCoord = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val === 0 ? null : val;
    const str = String(val).trim().replace(',', '.');
    if (str === '' || str === '0' || str === '0.0') return null;
    const num = parseFloat(str);
    return isNaN(num) || num === 0 ? null : num;
};

// Robust key finder for coordinates with deep lookup
export const getCoordinate = (item: any, keys: string[]) => {
    if (!item) return null;
    
    // Helper to check validity (non-zero number or non-empty string that isn't "0")
    const isValid = (val: any) => {
        if (val === undefined || val === null || val === '') return false;
        if (typeof val === 'number') return val !== 0;
        if (typeof val === 'string') return val !== '0' && val !== '0.0';
        return true;
    };

    // 1. Check top-level properties (lat, lon, latitude, etc.)
    for (const key of keys) {
        if (isValid(item[key])) return item[key];
        
        // Case-insensitive check
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(item).find(k => k.toLowerCase() === lowerKey);
        if (foundKey && isValid(item[foundKey])) return item[foundKey];
    }

    // 2. Check originalRow if available (Deep Lookup)
    const original = item.originalRow || item.rowData;
    if (original && typeof original === 'object') {
        for (const key of keys) {
            // Case-insensitive check inside originalRow
            const lowerKey = key.toLowerCase();
            const foundKey = Object.keys(original).find(k => k.toLowerCase() === lowerKey);
            if (foundKey && isValid(original[foundKey])) return original[foundKey];
        }
    }

    return null;
};