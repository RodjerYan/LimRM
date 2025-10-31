// This file is a placeholder.
// The application uses aiService.ts for interacting with the Gemini API via a proxy.

import { standardizeRegion } from '../utils/addressMappings';

/**
 * A reliable fallback function to call the Gemini AI model.
 * This should only be used when local parsing methods fail.
 * @param address The address string to parse.
 * @returns The region name as a string, or an empty string if not found.
 */
export async function callGeminiForRegion(address: string): Promise<string> {
    const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';
  
    const prompt = `
        Ты — эксперт по адресам РФ.
        Из строки адреса извлеки **только субъект РФ** (область, край, республика).
        Примеры:
        - "обл Орловская" -> "Орловская область"
        - "Брянская обл" -> "Брянская область"
        - "32038, обл Орловская" -> "Орловская область"
        Верни **одну строку**, без кавычек.
        Если не уверен — верни пустую строку.

        Адрес: """${address}"""
    `;

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            console.error('Gemini proxy request failed:', response.statusText);
            return '';
        }
        
        const text = await response.text();
        return text ? standardizeRegion(text) : '';
    } catch (e) {
        console.error('Gemini fetch error', e);
        return '';
    }
}
