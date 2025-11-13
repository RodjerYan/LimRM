import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { ensureSheetExists, appendRows, getSheetDataWithHeaders, getAllSheetTitles } from '../lib/sheets';
import { findAddressInRow } from '../utils/dataUtils';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

const REQUIRED_COLUMNS = ['Дистрибьютор', 'Торговая марка', 'Уникальное наименование товара', 'Фасовка', 'Вес, кг', 'Месяц', 'Адрес ТТ LimKorm', 'Канал продаж', 'РМ'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        if (!req.body || !req.body.fileBase64) {
            return res.status(400).json({ error: 'File (as fileBase64) is required.' });
        }

        const buffer = Buffer.from(req.body.fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
            return res.status(400).json({ error: 'Uploaded file is empty or in an incorrect format.' });
        }
        
        // Group data by Regional Manager (РМ)
        const dataByRM: { [key: string]: any[] } = jsonData.reduce((acc, row) => {
            const rm = row['РМ'] ? String(row['РМ']).trim() : 'Без РМ';
            if (!acc[rm]) {
                acc[rm] = [];
            }
            acc[rm].push(row);
            return acc;
        }, {});

        const allSheetTitles = await getAllSheetTitles();
        const processedRMs: string[] = [];

        for (const rm in dataByRM) {
            if (rm === 'Без РМ' && dataByRM[rm].length === 0) continue;
            processedRMs.push(rm);

            await ensureSheetExists(rm, allSheetTitles, REQUIRED_COLUMNS);

            const existingData = await getSheetDataWithHeaders(rm);
            const existingAddresses = new Set(existingData.map(row => findAddressInRow(row) || ''));

            const newRows = dataByRM[rm].filter(row => {
                const address = findAddressInRow(row);
                return address && !existingAddresses.has(address);
            });

            if (newRows.length > 0) {
                const rowsToAppend = newRows.map(row => REQUIRED_COLUMNS.map(header => row[header] || ''));
                await appendRows(rm, rowsToAppend);
            }
        }
        
        let initialData = [];
        for(const rm of processedRMs) {
            const sheetData = await getSheetDataWithHeaders(rm);
            initialData.push(...sheetData);
        }

        res.status(200).json({ 
            message: `Processing complete. ${processedRMs.length} RMs processed.`,
            rmSheets: processedRMs,
            initialData
        });

    } catch (error) {
        console.error('Error processing sales data:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'API error during file processing', details: errorMessage });
    }
}
