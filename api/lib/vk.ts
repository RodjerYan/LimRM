
import { URLSearchParams } from 'url';

const VK_API_VERSION = '5.199';

export interface VkError {
    error_code: number;
    error_msg: string;
    request_params: { key: string; value: string }[];
}

export interface VkResponse<T> {
    response?: T;
    error?: VkError;
}

/**
 * Универсальная функция для вызова методов VK API.
 * Использует сервисный ключ доступа из переменных окружения.
 * 
 * @param method Имя метода (например, 'wall.get', 'users.get')
 * @param params Параметры запроса
 * @returns Объект response от VK
 */
export async function vkApi<T = any>(method: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    // Получаем ключ из переменных окружения (VK_SERVICE_KEY или VK_ACCESS_TOKEN)
    const accessToken = process.env.VK_SERVICE_KEY || process.env.VK_ACCESS_TOKEN;
    
    if (!accessToken) {
        throw new Error('VK_SERVICE_KEY или VK_ACCESS_TOKEN не настроены в переменных окружения.');
    }

    const queryParams = new URLSearchParams({
        access_token: accessToken,
        v: VK_API_VERSION,
        lang: 'ru', // Принудительно русский язык ответов
    });

    // Добавляем параметры запроса
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
        }
    }

    const url = `https://api.vk.com/method/${method}?${queryParams.toString()}`;

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Network error: ${response.status} ${response.statusText}`);
        }

        const data: VkResponse<T> = await response.json();

        if (data.error) {
            console.error(`VK API Error in ${method}:`, data.error);
            throw new Error(`VK API Error [${data.error.error_code}]: ${data.error.error_msg}`);
        }

        if (data.response === undefined) {
             throw new Error('VK API вернул пустой ответ без ошибки.');
        }

        return data.response;
    } catch (error) {
        console.error(`Failed to call VK API method ${method}:`, error);
        throw error;
    }
}
