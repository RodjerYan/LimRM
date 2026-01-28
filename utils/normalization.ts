
import { AggregatedDataRow } from '../types';

export const normalize = (rows: any[]): AggregatedDataRow[] => {
    if (!Array.isArray(rows)) return [];
    const result: AggregatedDataRow[] = [];
    
    const safeFloat = (v: any) => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            const f = parseFloat(v.replace(',', '.'));
            return isNaN(f) ? undefined : f;
        }
        return undefined;
    };
    
    const isValidCoord = (n: any) => typeof n === 'number' && !isNaN(n) && n !== 0;

    rows.forEach((row, index) => {
        if (!row) return;
        const brandRaw = String(row.brand || '').trim();
        const hasMultipleBrands = brandRaw.length > 2 && /[,;|\r\n]/.test(brandRaw);

        const generateStableKey = (base: any, suffix: string | number) => {
            const baseStr = base.key || base.address || `idx_${index}`;
            return `${baseStr}_${suffix}`.replace(/\s+/g, '_');
        };

        const normalizeClient = (c: any, cIdx: number) => {
            const clientObj = { ...c };
            const original = c.originalRow || {}; 

            // 1. Explicitly map 'lng' to 'lon' if present
            if (c.lng !== undefined) {
                clientObj.lon = safeFloat(c.lng);
            }
            if (c.lat !== undefined) {
                clientObj.lat = safeFloat(c.lat);
            }

            // 2. Fallback checks
            if (!isValidCoord(clientObj.lat)) {
                clientObj.lat = safeFloat(c.latitude) || safeFloat(c.geo_lat) || safeFloat(c.y) || safeFloat(c.Lat) ||
                                safeFloat(original.lat) || safeFloat(original.latitude) || safeFloat(original.geo_lat) || safeFloat(original.y);
            }
            if (!isValidCoord(clientObj.lon)) {
                clientObj.lon = safeFloat(c.longitude) || safeFloat(c.geo_lon) || safeFloat(c.x) || safeFloat(c.Lng) || safeFloat(c.Lon) ||
                                safeFloat(original.lon) || safeFloat(original.lng) || safeFloat(original.longitude) || safeFloat(original.geo_lon) || safeFloat(original.x);
            }
            
            if (!clientObj.key) {
                clientObj.key = generateStableKey(row, `cli_${cIdx}`);
            }
            return clientObj;
        };

        if (hasMultipleBrands) {
            const parts = brandRaw.split(/[,;|\r\n]+/).map(b => b.trim()).filter(b => b.length > 0);
            if (parts.length > 1) {
                const splitFactor = 1 / parts.length;
                parts.forEach((brandPart, idx) => {
                    const regionName = row.region || 'Неизвестный регион';
                    result.push({
                        ...row,
                        key: generateStableKey(row, `spl_${idx}`),
                        brand: brandPart,
                        clientName: `${regionName}: ${brandPart}`,
                        fact: (row.fact || 0) * splitFactor,
                        potential: (row.potential || 0) * splitFactor,
                        growthPotential: (row.growthPotential || 0) * splitFactor,
                        clients: Array.isArray(row.clients) ? row.clients.map(normalizeClient) : []
                    });
                });
                return;
            }
        }
        
        let clientSource = row.clients;
        if (!Array.isArray(clientSource) || clientSource.length === 0) {
             clientSource = [row];
        }

        const normalizedClients = clientSource.map(normalizeClient);

        const regionName = row.region || 'Неизвестный регион';
        const brandName = row.brand || 'Без бренда';
        const finalClientName = row.clientName || `${regionName}: ${brandName}`;

        result.push({
            ...row,
            key: row.key || generateStableKey(row, 'm'),
            clientName: finalClientName,
            clients: normalizedClients
        });
    });
    return result;
};
