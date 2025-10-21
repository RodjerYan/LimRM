import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'Лист1'; 
const GEOCODING_LIMIT = 20; // Limit API calls to avoid timeouts and rate limits

const getAuth = () => {
    const credsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
    if (!credsBase64) {
        throw new Error('Google credentials environment variable GOOGLE_CREDENTIALS_BASE64 is not set.');
    }
    
    const credsJson = Buffer.from(credsBase64, 'base64').toString('utf-8');
    const { client_email, private_key } = JSON.parse(credsJson);

    return new JWT({
        email: client_email,
        key: private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Write scope
    });
};

// Nominatim requires a descriptive User-Agent
const userAgent = 'Geo-Analiz-Rynka-Limkorm/1.0 (https://ai.studio)';

async function geocodeAddress(address: string): Promise<{ lat: string, lon: string } | null> {
    if (!address) return null;
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&countrycodes=ru&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': userAgent },
        });
        if (!response.ok) {
            console.error(`Nominatim API error for address "${address}": ${response.status}`);
            return null;
        }
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: data[0].lat, lon: data[0].lon };
        }
        return null;
    } catch (error) {
        console.error(`Geocoding failed for address "${address}":`, error);
        return null;
    }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        
        await doc.loadInfo();
        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            sheet = doc.sheetsByIndex[0];
        }
        if (!sheet) {
            return res.status(404).json({ error: 'Sheet not found.' });
        }

        const rows = await sheet.getRows();
        
        let updated = 0;
        let geocodeAttempts = 0;

        for (const row of rows) {
            if (geocodeAttempts >= GEOCODING_LIMIT) {
                console.log(`Geocoding limit of ${GEOCODING_LIMIT} reached.`);
                break;
            }
            const hasCoords = row.get('Широта') && row.get('Долгота');
            const address = row.get('Адрес');

            if (!hasCoords && address) {
                geocodeAttempts++;
                console.log(`Geocoding address: ${address}`);
                const coords = await geocodeAddress(address);
                if (coords) {
                    row.set('Широта', coords.lat);
                    row.set('Долгота', coords.lon);
                    await row.save();
                    updated++;
                }
                // Small delay to be nice to Nominatim API
                await new Promise(resolve => setTimeout(resolve, 500)); 
            }
        }

        res.status(200).json({ 
            message: `Update process finished. Geocoded and updated ${updated} rows.`,
            added: 0, // This implementation only updates existing rows
            updated: updated,
        });

    } catch (error: any) {
        console.error('Error in update-okb:', error);
        res.status(500).json({ 
            error: 'Failed to update Google Sheet.', 
            details: error.message 
        });
    }
}
