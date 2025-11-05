import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { getOKBAddresses, batchUpdateOKBStatus } from '../lib/sheets';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', ['POST']);
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const okbAddresses = await getOKBAddresses();

        if (!req.body || !req.body.fileBase64) {
            return res.status(400).json({ error: 'Файл АКБ (в формате fileBase64) обязателен в теле запроса.' });
        }
        
        const buffer = Buffer.from(req.body.fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const akbData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const akbAddresses = new Set(akbData.flat().map(cell => String(cell).trim()));
        
        const updates: { rowIndex: number, status: string }[] = [];
        const results: { okbAddress: string, status: string }[] = [];

        okbAddresses.forEach((okbAddress, index) => {
            const status = akbAddresses.has(okbAddress) ? 'Совпадение' : 'Не найдено';
            updates.push({ rowIndex: index + 2, status });
            results.push({ okbAddress, status });
        });

        if (updates.length > 0) {
            await batchUpdateOKBStatus(updates);
        }

        res.status(200).json({ results });

    } catch (error) {
        console.error('--- КРИТИЧЕСКАЯ ОШИБКА В /api/get-okb-status ---');
        const errorMessage = error instanceof Error ? error.message : 'Произошла неизвестная ошибка';
        console.error('Детали ошибки:', errorMessage);
        if (error instanceof Error) console.error('Стек:', error.stack);
        
        res.status(500).json({ error: 'API-ошибка во время проверки статуса ОКБ', details: errorMessage });
    }
}