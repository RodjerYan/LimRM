import type { VercelRequest, VercelResponse } from '@vercel/node';
import { capitals } from '../utils/capitals.js';

// The VK API Key provided by the user
const VK_SERVICE_KEY = 'ewEMTbv4Js746kBQisdvWAcJ7cN0hCljEFeFbwwNPqMK2UIhGSwEIgA59iPeg7CnOHgTO0jWuhDRfKL7wciztb4tVBns55YJjN1ZxKrKHvYfAJLopaMrNtcsVeENFWK34aml6TGHAy3VyokUj8MS3C3LAi9Pm0Ll8e95eCMDnpTp9K667FtIzxm0tADo7jfHwDKjbROWtbEsmsfm484bCn4hWQeQQgo';
const VK_API_VERSION = '5.131';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    // --- MODE 1: VK DEMOGRAPHICS PROXY ---
    if (action === 'vk_demographics') {
        const { region } = req.query;

        if (!region || typeof region !== 'string') {
            return res.status(400).json({ error: 'Region name is required for demographics' });
        }

        try {
            // 1. Find Capital City for the Region
            const capitalEntry = capitals.find(c => c.region_name?.toLowerCase() === region.toLowerCase());
            const queryCity = capitalEntry ? capitalEntry.name : region;

            // 2. Get City ID from VK
            const citySearchUrl = `https://api.vk.com/method/database.getCities?q=${encodeURIComponent(queryCity)}&country_id=1&count=1&access_token=${VK_SERVICE_KEY}&v=${VK_API_VERSION}`;
            
            const cityRes = await fetch(citySearchUrl);
            const cityData = await cityRes.json();

            if (!cityData.response || cityData.response.count === 0 || !cityData.response.items[0]) {
                return res.status(404).json({ error: `City not found in VK database: ${queryCity}` });
            }

            const cityId = cityData.response.items[0].id;
            const foundCityTitle = cityData.response.items[0].title;

            // 3. Search Users in this City to calculate age
            const usersSearchUrl = `https://api.vk.com/method/users.search?city=${cityId}&count=100&fields=bdate&access_token=${VK_SERVICE_KEY}&v=${VK_API_VERSION}`;
            
            const usersRes = await fetch(usersSearchUrl);
            const usersData = await usersRes.json();

            if (!usersData.response || !usersData.response.items) {
                throw new Error('Failed to fetch users from VK');
            }

            const users = usersData.response.items;
            
            // 4. Calculate Average Age
            let totalAge = 0;
            let count = 0;
            const currentYear = new Date().getFullYear();

            users.forEach((user: any) => {
                if (user.bdate) {
                    const parts = user.bdate.split('.');
                    // We need the year (3 parts: D.M.YYYY)
                    if (parts.length === 3) {
                        const birthYear = parseInt(parts[2], 10);
                        const age = currentYear - birthYear;
                        // Filter unrealistic ages to clean data
                        if (age >= 14 && age <= 90) {
                            totalAge += age;
                            count++;
                        }
                    }
                }
            });

            if (count === 0) {
                return res.status(200).json({ 
                    avgAge: null, 
                    message: 'Not enough data with public birthdays found',
                    city: foundCityTitle 
                });
            }

            const avgAge = totalAge / count;

            return res.status(200).json({
                region: region,
                city: foundCityTitle,
                avgAge: Math.round(avgAge * 10) / 10,
                sampleSize: count,
                source: 'VK.com API'
            });

        } catch (error) {
            console.error('VK API Error:', error);
            return res.status(500).json({ error: 'Internal Server Error during VK request', details: (error as Error).message });
        }
    }

    // --- MODE 2: STANDARD GEOCODING (NOMINATIM) ---
    const address = req.query.address as string;

    if (!address) {
        return res.status(400).json({ error: 'Address query parameter is required.' });
    }

    // Expanded list of country codes to include all CIS regions relevant to the app
    const countryCodes = 'ru,by,kz,ua,kg,uz,tj,tm,am,az,ge,md';
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=${countryCodes}`;
    
    try {
        const nominatimRes = await fetch(nominatimUrl, {
            headers: {
                'User-Agent': 'LimkormGeoAnalyzer/1.0 (https://limkorm.ru/)',
            },
        });

        if (!nominatimRes.ok) {
            throw new Error(`Nominatim API responded with status: ${nominatimRes.status}`);
        }

        const data = await nominatimRes.json() as any[];

        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
            res.status(200).json({ lat: parseFloat(lat), lon: parseFloat(lon) });
        } else {
            res.status(404).json({ error: 'Coordinates not found for the given address.' });
        }
    } catch (error) {
        console.error('Geocoding proxy error:', error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred during geocoding.';
        res.status(500).json({ error: 'Failed to fetch geocoding data', details: message });
    }
}