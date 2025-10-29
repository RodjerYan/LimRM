// services/addressParser.ts
// FIX: Import `cityToRegion` to resolve the 'Cannot find name' error.
import { getRegionByPostal, getRegionByCity, cityToRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

// Gemini fallback prompt
const GEMINI_FALLBACK_PROMPT = `
Ты — эксперт по адресам РФ.  
Из строки адреса извлеки **только субъект РФ** (область, край, республика, город федерального значения).  
Если в строке явно указано «Орловская обл», «Смоленская обл» и т.п. – верни полное название.  
Если есть почтовый индекс, используй его (первая пара цифр).  
Верни **одну строку** без кавычек и без лишних слов.  
Если не уверен – верни "Регион не определён".

Адрес: """{ADDRESS}"""
`;

const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';

/**
 * Attempts to parse a region from an address using a Gemini AI fallback.
 * @param address The raw address string.
 * @returns The region name or null if not found.
 */
async function getRegionFromGemini(address: string): Promise<string> {
    try {
        const prompt = GEMINI_FALLBACK_PROMPT.replace('{ADDRESS}', address);
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok || !response.body) {
            console.error('Gemini fallback failed: Invalid response from proxy');
            return '';
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let resultText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resultText += decoder.decode(value, { stream: true });
        }

        const text = resultText.trim();
        return text.includes('область') || text.includes('край') || text.includes('республика') || text.includes('Москва') || text.includes('Санкт-Петербург')
            ? text
            : '';
            
    } catch (error) {
        console.error('Error during Gemini fallback:', error);
        return '';
    }
}


/**
 * A comprehensive asynchronous function to parse a Russian address and determine the region.
 * It uses a prioritized approach: explicit region, postal code, city name, and finally an AI fallback.
 * @param address The raw address string.
 * @returns A promise that resolves to a structured ParsedAddress object.
 */
export async function parseRussianAddress(address: string | undefined | null): Promise<Omit<ParsedAddress, 'formattedAddress'>> {
    const result: Omit<ParsedAddress, 'formattedAddress'> = {
        country: "Россия", region: null, city: null, street: null, house: null,
        postalCode: null, lat: null, lon: null, confidence: 0,
        source: 'unknown', ambiguousCandidates: []
    };

    if (!address || typeof address !== 'string' || address.trim().length < 3) {
        return { ...result, region: "Регион не определён" };
    }
    
    // --- Prioritized Parsing Logic ---
    let region: string | null = null;
    let source: ParsedAddress['source'] = 'unknown';
    let confidence = 0;

    // 1. Explicit Region Match (Highest Priority)
    const explicitMatch = address.match(/([А-Яа-яЁё\s-]+?)\s+(обл\.?|область|край|республика|р-н|АО)\b/i);
    if (explicitMatch) {
        // Construct a partial region name to find the canonical version
        const potentialRegionName = explicitMatch[1].trim();
        const regionType = explicitMatch[2].replace(/\./g, '');
        
        // Find the full official name from cityToRegion values
        // FIX: Explicitly type `allRegions` as string[] to ensure correct type inference in the `.find()` method.
        const allRegions: string[] = [...new Set(Object.values(cityToRegion))];
        const foundRegion = allRegions.find(r => r.toLowerCase().includes(potentialRegionName.toLowerCase()));

        if (foundRegion) {
            // FIX: The type of `foundRegion` is now correctly inferred as `string`, making this assignment valid.
            region = foundRegion;
            source = 'explicit_region';
            confidence = 0.99;
        } else {
            // Fallback to constructed name if not found in canonical list
            region = `${potentialRegionName} ${regionType}`;
            source = 'explicit_region';
            confidence = 0.95;
        }
    }

    // 2. Postal Code Match (If region not found yet)
    const postalMatch = address.match(/(\d{6})/);
    if (postalMatch) {
        result.postalCode = postalMatch[1];
        if (!region) {
            const regionFromPostal = getRegionByPostal(result.postalCode);
            if (regionFromPostal) {
                region = regionFromPostal;
                source = 'postal';
                confidence = 0.9;
            }
        }
    }

    // 3. City Name Match (If region still not found)
    const cityMatch = address.match(/(?:г\.?|рп|с|д)\s*([А-Яа-яЁё\s-]+)(?:,|$)/i);
    if (cityMatch) {
        result.city = cityMatch[1].trim();
        if (!region) {
            const regionFromCity = getRegionByCity(result.city);
            if (regionFromCity) {
                region = regionFromCity;
                source = 'city_lookup';
                confidence = 0.8;
            }
        }
    }
    
    // 4. Gemini Fallback (Last resort)
    if (!region) {
        const regionFromAI = await getRegionFromGemini(address);
        if (regionFromAI) {
            region = regionFromAI;
            source = 'fuzzy';
            confidence = 0.7;
        }
    }

    result.region = region || "Регион не определён";
    result.source = source;
    result.confidence = confidence;

    return result;
}