import type { VercelRequest, VercelResponse } from '@vercel/node';
import { nanoid } from 'nanoid';

// 🎨 Цвета для консоли
const colors = {
  reset: "\x1b[0m", gray: "\x1b[90m", red: "\x1b[31m", 
  green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", bold: "\x1b[1m"
};

// --- Типы данных ---
interface PotentialClient {
    name: string; address: string; type: string;
    lat?: number; lon?: number;
}

interface TaskResult {
    totalMarketCount: number;
    newClients: PotentialClient[];
    okbCount: number;
    cityCenter: { lat: number; lon: number } | null;
}

interface Task {
    id: string;
    locationName: string;
    status: 'pending' | 'done' | 'error';
    result?: TaskResult;
    error?: string;
    createdAt: number;
}

const tasks = new Map<string, Task>();

// --- Логика обработки ---
const normalizeAddress = (addr: string): string => {
    if (!addr) return '';
    return addr.toLowerCase()
        .replace(/[\s.,-/\\()]/g, '')
        .replace(/^(ул|улица|пр|проспект|пер|перелок|д|дом|к|корпус|кв|квартира|стр|строение|обл|область|рн|район|г|город|пос|поселок)\.?/g, '');
};

async function getAndFilterMarketPotential(locationName: string, existingClients: string[]): Promise<TaskResult> {
    const searchTerms = ['зоомагазин', 'ветеринарная клиника', 'ветаптека'];
    const allFoundClients = new Map<string, PotentialClient>();
    let cityCenter: { lat: number; lon: number } | null = null;
    const MAX_RETRIES = 3;

    const normalizedExistingAddresses = new Set(existingClients.map(normalizeAddress).filter(Boolean));

    const queryNominatim = async (term: string) => {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const params = new URLSearchParams({
                    q: `${term} в ${locationName}`,
                    format: 'jsonv2', addressdetails: '1', extratags: '1', limit: '100'
                });
                const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
                const response = await fetch(url, { headers: { 'User-Agent': 'Limkorm-Geo-Analysis-App/1.2 (Vercel Serverless Task)' }});
                if (!response.ok) {
                    if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
                        await new Promise(res => setTimeout(res, 1000 * (attempt + 1))); continue;
                    }
                    throw new Error(`Nominatim query failed for "${term}" with status ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(res => setTimeout(res, 1000 * (attempt + 1))); continue;
                }
                throw error;
            }
        }
        return [];
    };

    for (const term of searchTerms) {
        try {
            const results = await queryNominatim(term);
            if (Array.isArray(results)) {
                for (const result of results) {
                    const key = result.osm_type + result.osm_id;
                    if (!allFoundClients.has(key) && result.lat && result.lon) {
                        const client: PotentialClient = {
                            name: result.name || result.display_name.split(',')[0],
                            address: result.display_name,
                            type: result.extratags?.shop || result.extratags?.amenity || result.type,
                            lat: parseFloat(result.lat),
                            lon: parseFloat(result.lon)
                        };
                        allFoundClients.set(key, client);
                        if (!cityCenter && result.importance > 0.4) {
                            cityCenter = { lat: parseFloat(result.lat), lon: parseFloat(result.lon) };
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`[OSM Task] Failed for term "${term}" in "${locationName}":`, error);
        }
    }
    
    if (!cityCenter && allFoundClients.size > 0) {
        const firstClient = allFoundClients.values().next().value;
        if (firstClient?.lat && firstClient?.lon) cityCenter = { lat: firstClient.lat, lon: firstClient.lon };
    }

    const newClients = Array.from(allFoundClients.values()).filter(client => {
        const normalizedNewAddress = normalizeAddress(client.address);
        return normalizedNewAddress && !normalizedExistingAddresses.has(normalizedNewAddress);
    });
    
    return {
        totalMarketCount: allFoundClients.size,
        newClients: newClients,
        okbCount: newClients.length,
        cityCenter
    };
}

async function processTask(taskId: string) {
    const task = tasks.get(taskId);
    if (!task) return;

    try {
        const { locationName } = task as any; // Temporary cast to get extra properties
        const { existingClients } = task as any;
        const result = await getAndFilterMarketPotential(locationName, existingClients);
        tasks.set(taskId, { ...task, status: 'done', result });
    } catch (err: any) {
        tasks.set(taskId, { ...task, status: 'error', error: err.message || 'Unknown error during processing.' });
    }
}

// --- Основной обработчик API ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const { locationName, existingClients } = req.body;
    if (!locationName) return res.status(400).json({ error: 'Missing "locationName" in request body.' });

    const taskId = nanoid(10);
    const newTask: any = { // Using `any` to attach temp properties
      id: taskId, locationName, existingClients: existingClients || [],
      status: 'pending', createdAt: Date.now(),
    };
    tasks.set(taskId, newTask);

    processTask(taskId); // Run async

    console.log(`${colors.cyan}✨ New OSM task created:${colors.reset} ${taskId} for ${locationName}`);
    return res.status(202).json({ taskId });
  }

  if (req.method === 'GET') {
    const { taskId } = req.query;
    if (!taskId || typeof taskId !== 'string') return res.status(400).json({ error: 'Missing "taskId" query parameter.' });

    const task = tasks.get(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    
    const { locationName, existingClients, ...publicTaskData } = task as any;
    return res.status(200).json(publicTaskData);
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

// Простая очистка старых задач
setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    for (const [key, task] of tasks.entries()) {
        if (now - task.createdAt > tenMinutes) {
            tasks.delete(key);
            console.log(`${colors.gray}🗑️ Cleared old OSM task:${colors.reset} ${key}`);
        }
    }
}, 60 * 1000);
