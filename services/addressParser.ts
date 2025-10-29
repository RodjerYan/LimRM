import { getRegionByCity, getRegionByPostal, cityToRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

// Gemini fallback prompt
const GEMINI_FALLBACK_PROMPT = `
You are an expert in Russian Federation administrative divisions and postal codes.
Your task is to identify the federal subject (region, oblast, krai, republic, federal city) from the given address string.
The address may be incomplete or contain errors. Infer the region if it's not explicitly mentioned.

- Use the city name to infer the region (e.g., "г. Орел" is in "Орловская область").
- Use the 6-digit postal code to infer the region (e.g., "302016" is in "Орловская область").
- The final region name must be the official name of a Russian federal subject.

Address: "{ADDRESS}"

Return a single JSON object with one key: "region".
If the region can be determined, the value should be the region's name (e.g., { "region": "Орловская область" }).
If it's impossible to determine, the value should be null (e.g., { "region": null }).
Do not provide any explanation, just the JSON object.
`;

const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';

/**
 * Attempts to parse a region from an address using a Gemini AI fallback.
 * @param address The raw address string.
 * @returns The region name or null if not found.
 */
async function getRegionFromGemini(address: string): Promise<string | null> {
    try {
        const prompt = GEMINI_FALLBACK_PROMPT.replace('{ADDRESS}', address);
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok || !response.body) {
            console.error('Gemini fallback failed: Invalid response from proxy');
            return null;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let resultText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resultText += decoder.decode(value, { stream: true });
        }

        // Clean up and parse the JSON from the streaming response
        const jsonMatch = resultText.match(/\{.*?\}/s);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.region || null;
        }
        return null;
    } catch (error) {
        console.error('Error during Gemini fallback:', error);
        return null;
    }
}

/**
 * A comprehensive asynchronous function to parse a Russian address and determine the region.
 * It uses a prioritized approach: postal code, city name, explicit region keywords, and finally an AI fallback.
 * @param address The raw address string.
 * @returns A promise that resolves to a structured ParsedAddress object.
 */
export async function parseRussianAddress(address: string | undefined | null): Promise<Omit<ParsedAddress, 'formattedAddress'>> {
    const result: Omit<ParsedAddress, 'formattedAddress'> = {
        country: "Россия", region: null, city: null, street: null, house: null,
        postalCode: null, lat: null, lon: null, confidence: 0,
        source: 'unknown', ambiguousCandidates: []
    };
    
    const defaultUndefined = { ...result, region: "Регион не определён" };

    if (!address || typeof address !== 'string' || address.trim().length < 3) {
        return defaultUndefined;
    }
    
    const cleanedAddress = address.replace(/ё/g, 'е');
    const normalizedAddress = cleanedAddress.toLowerCase().replace(/[.,"]/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Extract Postal Code and attempt lookup
    const postalMatch = cleanedAddress.match(/\b(\d{6})\b/);
    if (postalMatch) {
        result.postalCode = postalMatch[1];
        const regionFromPostal = getRegionByPostal(result.postalCode);
        if (regionFromPostal) {
            result.region = regionFromPostal;
            result.source = 'postal';
            result.confidence = 0.95;
            return { ...result, region: result.region || 'Регион не определён' };
        }
    }

    // 2. Extract City and attempt lookup
    const cityMatch = cleanedAddress.match(/\b(г|город|пгт|село|деревня|д|рп)\s*\.?\s*([А-Яа-я-\s]+)\b/i);
    let cityNameForLookup: string | null = null;
    if (cityMatch) {
        cityNameForLookup = cityMatch[2].trim().toLowerCase();
        result.city = cityNameForLookup.charAt(0).toUpperCase() + cityNameForLookup.slice(1);
    } else {
        // Fallback for city names without "г." prefix by checking against known centers
        const words = normalizedAddress.split(' ');
        for(const word of words) {
            if (getRegionByCity(word)) {
                cityNameForLookup = word;
                result.city = word.charAt(0).toUpperCase() + word.slice(1);
                break;
            }
        }
    }

    if (cityNameForLookup) {
        const regionFromCity = getRegionByCity(cityNameForLookup);
        if (regionFromCity) {
            result.region = regionFromCity;
            result.source = 'city_lookup';
            result.confidence = 0.9;
            return { ...result, region: result.region || 'Регион не определён' };
        }
    }


    // 3. Look for explicit region keywords (e.g., "Орловская область")
    // FIX: Use the comprehensive cityToRegion map as the source of truth for all regions.
    const allRegions = [...new Set(Object.values(cityToRegion))];
    for (const regionName of allRegions) {
        const regionKeyword = regionName.toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/\b(г|республика|край|область|автономный округ|ао)\b/g, '')
            .trim().split(' ')[0];
            
        if (regionKeyword && regionKeyword.length > 3) {
            const regionRegex = new RegExp(`\\b${regionKeyword}\\w*\\s*(область|обл|край|республика|респ)?\\b`, 'i');
            if (regionRegex.test(cleanedAddress)) {
                result.region = regionName;
                result.source = 'explicit_region';
                result.confidence = 0.85;
                return { ...result, region: result.region || 'Регион не определён' };
            }
        }
    }
    
    // 4. Gemini AI Fallback (if all local methods fail)
    const regionFromAI = await getRegionFromGemini(address);
    if (regionFromAI) {
        result.region = regionFromAI;
        result.source = 'fuzzy';
        result.confidence = 0.7; // Lower confidence as it's an AI guess
        return { ...result, region: result.region || 'Регион не определён' };
    }

    return defaultUndefined;
}