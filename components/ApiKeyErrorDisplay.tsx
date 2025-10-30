import React from 'react';

const ApiKeyErrorDisplay: React.FC = () => (
    <div className="flex items-center justify-center h-screen p-4">
        <div className="bg-card-bg/70 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-danger/50 max-w-4xl text-center">
            <h1 className="text-3xl font-bold text-danger mb-4">Ошибка Конфигурирования Сервера</h1>
            <p className="text-lg text-slate-300 mb-6">
                Приложение не может запуститься, так как не настроены переменные окружения, необходимые для его работы на Vercel.
            </p>
            <div className="text-left bg-gray-900/50 p-6 rounded-lg border border-gray-700">
                <p className="font-semibold text-white mb-3">Как это исправить (для Vercel):</p>
                <ol className="list-decimal list-inside space-y-3 text-slate-400">
                    <li>
                        Перейдите в ваш проект на Vercel, откройте вкладку **"Settings"**, затем выберите **"Environment Variables"**.
                    </li>
                    <li>
                        Добавьте следующие переменные:
                        <ul className="list-disc list-inside ml-6 mt-3 space-y-4 text-slate-300">
                           <li>
                                <div>
                                    <code className="bg-gray-800 text-yellow-400 px-2 py-1 rounded">API_KEY_1</code> ... <code className="bg-gray-800 text-yellow-400 px-2 py-1 rounded">API_KEY_4</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    **(Секрет)** Ваши четыре ключа API от Google Gemini. Сервер будет использовать их случайным образом.
                                </div>
                           </li>
                           <li>
                                <div>
                                    <code className="bg-gray-800 text-yellow-400 px-2 py-1 rounded">GROK_API_KEY</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    **(Секрет)** Ваш ключ API от Grok (x.ai).
                                </div>
                           </li>
                           <li>
                                <div>
                                    <code className="bg-gray-800 text-yellow-400 px-2 py-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1 space-y-1">
                                    <p>**(Секрет)** Полный JSON-ключ вашего сервисного аккаунта Google.</p>
                                    <p className="text-yellow-500">
                                        **Важно:** Скопируйте все содержимое JSON-файла и вставьте его как одну строку. Убедитесь, что нет переносов строк.
                                    </p>
                                     <p>Не забудьте "поделиться" вашей Google Таблицей с адресом `client_email` из этого JSON-ключа, выдав ему права **Редактора**.</p>
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
                           <li>
                                <div>
                                     <code className="bg-gray-800 text-cyan-400 px-2 py-1 rounded">VITE_GROK_PROXY_URL</code>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    **(Конфигурация)** Вставьте значение <code className="bg-gray-700 px-1 rounded">/api/grok-proxy</code>. Это путь для прокси-запросов к Grok API.
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
