import React from 'react';

const ApiKeyErrorDisplay: React.FC = () => (
    <div className="flex items-center justify-center h-screen p-4">
        <div className="bg-card-bg/70 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-danger/50 max-w-3xl text-center">
            <h1 className="text-3xl font-bold text-danger mb-4">Ошибка Конфигурации</h1>
            <p className="text-lg text-slate-300 mb-6">
                Приложение не может запуститься, так как не настроен ключ API для Google Gemini.
            </p>
            <div className="text-left bg-gray-900/50 p-6 rounded-lg border border-gray-700">
                <p className="font-semibold text-white mb-3">Как это исправить (для Vercel):</p>
                <div className="bg-red-900/40 border border-danger/50 p-3 rounded-md mb-4">
                    <p className="font-bold text-danger">Внимание!</p>
                    <p className="text-slate-300 text-sm">Вам нужно создать **ДВЕ** переменные: 
                    <code className="bg-gray-900 text-accent px-1 rounded mx-1">API_KEY</code> (для сервера, с настоящим ключом) и 
                    <code className="bg-gray-900 text-accent px-1 rounded mx-1">VITE_GEMINI_API_KEY</code> (для клиента, с любым текстом).
                    Прочтите инструкцию внимательно.
                    </p>
                </div>
                <ol className="list-decimal list-inside space-y-3 text-slate-400">
                    <li>
                        Перейдите в <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Google AI Studio</a> и создайте новый ключ API.
                    </li>
                    <li>Перейдите в настройки вашего проекта на Vercel.</li>
                    <li>
                        Откройте вкладку <code className="bg-gray-900 text-gray-300 px-1 py-0.5 rounded mx-1">Settings</code> → <code className="bg-gray-900 text-gray-300 px-1 py-0.5 rounded mx-1">Environment Variables</code>.
                    </li>
                    <li>
                        Создайте переменную с именем <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">API_KEY</code>. Этот ключ будет использоваться на сервере для безопасных запросов к Google.
                    </li>
                    <li>
                        В поле значения (value) вставьте ваш ключ API от <strong>Google</strong>.
                    </li>
                    <li>
                        Создайте вторую переменную с именем <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">VITE_GEMINI_API_KEY</code>. Это необходимо, чтобы приложение на стороне клиента знало, что ключ настроен.
                    </li>
                     <li>
                        В ее значение вставьте любую непустую строку, например, <code className="bg-gray-900 text-gray-300 px-1 py-0.5 rounded mx-1">key_is_set</code>. Сам ключ API не должен быть виден в коде клиента.
                    </li>
                    <li>
                        Убедитесь, что обе переменные доступны для всех окружений (Production, Preview, Development).
                    </li>
                    <li>
                        Сохраните и <strong>перезапустите развертывание (Redeploy)</strong> вашего проекта, чтобы изменения вступили в силу.
                    </li>
                </ol>
                <div className="mt-6 pt-4 border-t border-gray-600">
                    <p className="font-semibold text-amber-400 mb-2">
                        Обязательно: Настройка прокси
                    </p>
                    <p className="text-slate-400">
                        Для безопасного использования API **необходимо** настроить прокси-сервер (он уже есть в коде). Убедитесь, что переменная <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">VITE_GEMINI_PROXY_URL</code> установлена в значение <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">/api/gemini-proxy</code>.
                    </p>
                </div>
            </div>
            <p className="text-xs text-gray-500 mt-6">
                Эта ошибка отображается, потому что клиентская переменная <code className="bg-gray-900 text-gray-400 text-xs px-1 rounded">VITE_GEMINI_API_KEY</code> не была найдена. Серверная часть использует <code className="bg-gray-900 text-gray-400 text-xs px-1 rounded">API_KEY</code> для запросов.
            </p>
        </div>
    </div>
);

export default ApiKeyErrorDisplay;