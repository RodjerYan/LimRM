const TOTAL_DURATION = 15000;

const steps = [
    { progress: 0, message: 'Задача поставлена в очередь...' },
    { progress: 15, message: 'Подключение к источникам Росстата...' },
    { progress: 30, message: 'Загрузка данных по демографии...' },
    { progress: 50, message: 'Анализ рыночных индексов...' },
    { progress: 75, message: 'Агрегация данных по регионам...' },
    { progress: 90, message: 'Сохранение новых аналитических срезов...' },
    { progress: 100, message: 'Обновление завершено! Приложение будет перезагружено.' },
];

export default function handler(req: Request) {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
        return new Response(JSON.stringify({ error: 'jobId is required' }), { status: 400 });
    }

    const startTime = parseInt(jobId, 10);
    if (isNaN(startTime)) {
        return new Response(JSON.stringify({ error: 'Invalid jobId' }), { status: 400 });
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
    
    const status = {
        status: progress < 100 ? 'processing' : 'completed',
        message: currentStep.message,
        progress: progress,
    };
    
    return new Response(JSON.stringify(status), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        }
    });
}