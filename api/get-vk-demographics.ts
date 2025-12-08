
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { capitals } from '../utils/capitals.js';

// The VK API Key provided by the user
const VK_SERVICE_KEY = 'ewEMTbv4Js746kBQisdvWAcJ7cN0hCljEFeFbwwNPqMK2UIhGSwEIgA59iPeg7CnOHgTO0jWuhDRfKL7wciztb4tVBns55YJjN1ZxKrKHvYfAJLopaMrNtcsVeENFWK34aml6TGHAy3VyokUj8MS3C3LAi9Pm0Ll8e95eCMDnpTp9K667FtIzxm0tADo7jfHwDKjbROWtbEsmsfm484bCn4hWQeQQgo';
const VK_API_VERSION = '5.131';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { region } = req.query;

    if (!region || typeof region !== 'string') {
        return res.status(400).json({ error: 'Region name is required' });
    }

    try {
        // 1. Find Capital City for the Region
        // We use the local capitals database to map "Region Name" -> "City Name"
        // This is crucial because VK searches users by City, not Region.
        const capitalEntry = capitals.find(c => c.region_name?.toLowerCase() === region.toLowerCase());
        
        // Fallback: If region IS the city (e.g. Moscow), or no mapping found, try using region name itself
        const queryCity = capitalEntry ? capitalEntry.name : region;

        console.log(`[VK API] Searching for city: ${queryCity} (Region: ${region})`);

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
        // fetching 100 users with 'bdate' field
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
                    // Filter unrealistic ages to clean data (e.g. < 10 or > 90 often fake)
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

        res.status(200).json({
            region: region,
            city: foundCityTitle,
            avgAge: Math.round(avgAge * 10) / 10, // Round to 1 decimal
            sampleSize: count,
            source: 'VK.com API'
        });

    } catch (error) {
        console.error('VK API Error:', error);
        res.status(500).json({ error: 'Internal Server Error during VK request', details: (error as Error).message });
    }
}