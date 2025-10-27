import React from 'react';

const ApiKeyErrorDisplay: React.FC = () => (
    <div className="flex items-center justify-center h-screen p-4">
        <div className="bg-card-bg/70 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-danger/50 max-w-4xl text-center">
            <h1 className="text-3xl font-bold text-danger mb-4">Ошибка Конфигурации</h1>
            <p className="text-lg text-slate-300 mb-6">
                Приложение не может запуститься, так как не настроены переменные окружения, необходимые для его работы на Vercel.
            </p>
            <div className="text-left bg-gray-900/50 p-6 rounded-lg border border-gray-700">
                <p className="font-semibold text-white mb-3">Как это исправить (для Vercel):</p>
                <div className="bg-yellow-900/40 border border-warning/50 p-3 rounded-md mb-4">
                    <p className="font-bold text-warning">Внимание!</p>
                    <p className="text-slate-300 text-sm">
                        Вам нужно настроить **ЧЕТЫРЕ** переменные окружения в настройках вашего проекта на Vercel.
                    </p>
                </div>
                <ol className="list-decimal list-inside space-y-3 text-slate-400">
                    <li>
                        Перейдите в ваш проект на Vercel, откройте вкладку **"Settings"**, затем выберите **"Environment Variables"**.
                    </li>
                    <li>
                        Добавьте следующие четыре переменные:
                        <ul className="list-disc list-inside ml-6 mt-3 space-y-4 text-slate-300">
                           <li>
                                <div>
                                    <code className="bg-gray-800 text-yellow-400 px-2 py-1 rounded">API_KEY</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    **(Секрет)** Ваш ключ API от Google Gemini. Он используется на сервере и должен оставаться в секрете.
                                </div>
                           </li>
                           <li>
                                <div>
                                    <code className="bg-gray-800 text-yellow-400 px-2 py-1 rounded">GOOGLE_SCRIPT_URL</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    **(Секрет)** Полный URL вашего опубликованного Google Apps Script для получения данных из таблицы.
                                </div>
                           </li>
                            <li>
                                <div>
                                    <code className="bg-gray-800 text-cyan-400 px-2 py-1 rounded">VITE_GEMINI_API_KEY</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    **(Конфигурация)** Вставьте значение <code className="bg-gray-700 px-1 rounded">key_is_set</code>. Это "заглушка", которая сообщает приложению, что ключ настроен на сервере.
                                </div>
                           </li>
                            <li>
                                <div>
                                     <code className="bg-gray-800 text-cyan-400 px-2 py-1 rounded">VITE_GEMINI_PROXY_URL</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    **(Конфигурация)** Вставьте значение <code className="bg-gray-700 px-1 rounded">/api/gemini-proxy</code>. Это путь для прокси-запросов к Gemini API.
                                </div>
                           </li>
                        </ul>
                    </li>
                     <li>
                        После добавления переменных, перейдите на вкладку **"Deployments"**, выберите последнее развертывание и нажмите **"Redeploy"** (Переразвернуть), чтобы применить изменения.
                    </li>
                </ol>
            </div>
            <p className="text-xs text-gray-500 mt-6">
                Эта ошибка отображается, потому что клиентская переменная <code className="bg-gray-900 text-gray-400 text-xs px-1 rounded">VITE_GEMINI_API_KEY</code> не была найдена в процессе сборки.
            </p>
        </div>
    </div>
);

export default ApiKeyErrorDisplay;
