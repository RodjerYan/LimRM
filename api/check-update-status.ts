
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { UpdateJobStatus } from '../types';

const TOTAL_DURATION = 15000; // 15 seconds total job time

const steps = [
    { progress: 0, message: 'Задача поставлена в очередь...' },
    { progress: 15, message: 'Подключение к источникам Росстата...' },
    { progress: 30, message: 'Загрузка данных по демографии...' },
    { progress: 50, message: 'Анализ рыночных индексов...' },
    { progress: 75, message: 'Агрегация данных по регионам...' },
    { progress: 90, message: 'Сохранение новых аналитических срезов...' },
    { progress: 100, message: 'Обновление завершено! Приложение будет перезагружено.' },
];

export default function handler(req: VercelRequest, res: VercelResponse) {
    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({ error: 'jobId is required' });
    }

    const startTime = parseInt(jobId, 10);
    if (isNaN(startTime)) {
        return res.status(400).json({ error: 'Invalid jobId' });
    }

    const elapsedTime = Date.now() - startTime;
    const progress = Math.min(100, Math.floor((elapsedTime / TOTAL_DURATION) * 100));

    let currentStep = steps[0];
    for(const step of steps) {
        if (progress >= step.progress) {
            currentStep = step;
        } else {
            break;
        }
    }
    
    const status: UpdateJobStatus = {
        status: progress < 100 ? 'processing' : 'completed',
        message: currentStep.message,
        progress: progress,
    };
    
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json(status);
}
