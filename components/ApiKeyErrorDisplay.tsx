import React from 'react';

const ApiKeyErrorDisplay: React.FC = () => (
    <div className="flex items-center justify-center h-screen p-4">
        <div className="bg-card-bg/70 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-danger/50 max-w-4xl text-center">
            <h1 className="text-3xl font-bold text-danger mb-4">Ошибка Конфигурирования Сервера</h1>
            <p className="text-lg text-slate-700 mb-6">
                Приложение не может запуститься, так как не настроены переменные окружения, необходимые для его работы на Render.com.
            </p>
            <div className="text-left bg-white p-6 rounded-lg border border-gray-200">
                <p className="font-semibold text-gray-900 mb-3">Как это исправить (для Render):</p>
                <ol className="list-decimal list-inside space-y-3 text-slate-600">
                    <li>
                        Перейдите в ваш сервис на Render.com, выберите вкладку **"Environment"**.
                    </li>
                    <li>
                        Добавьте ключи ИИ (поддерживается ротация до 20 ключей):
                        <ul className="list-disc list-inside ml-6 mt-3 space-y-4 text-slate-700">
                           <li>
                                <div>
                                    <code className="bg-gray-100 text-yellow-400 px-2 py-1 rounded">API_KEY</code> или <code className="bg-gray-100 text-yellow-400 px-2 py-1 rounded">API_KEY_1</code> ... <code className="bg-gray-100 text-yellow-400 px-2 py-1 rounded">API_KEY_20</code>
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                    Вставьте ваши ключи Gemini (key1, key2...) в переменные с именами API_KEY_1, API_KEY_2 и т.д. Сервер будет выбирать случайный ключ для каждого запроса.
                                </div>
                           </li>
                           <li>
                                <div>
                                    <code className="bg-gray-100 text-yellow-400 px-2 py-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code>
                                </div>
                                <div className="text-xs text-gray-600 mt-1 space-y-1">
                                    <p>**(Секрет)** Полный JSON-ключ вашего сервисного аккаунта Google.</p>
                                    <p className="text-yellow-500">
                                        **Важно:** Скопируйте все содержимое JSON-файла и вставьте его как одну строку. Убедитесь, что нет переносов строк (Render иногда экранирует их, возможно потребуется удалить \n вручную, если возникнут ошибки).
                                    </p>
                                     <p>Не забудьте "поделиться" вашей Google Таблицей с адресом `client_email` из этого JSON-ключа, выдав ему права **Редактора**.</p>
                                </div>
                           </li>
                            <li>
                                <div>
                                    <code className="bg-gray-100 text-cyan-400 px-2 py-1 rounded">VITE_GEMINI_API_KEY</code>
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                    **(Конфигурация)** Вставьте значение <code className="bg-gray-100 px-1 rounded">key_is_set</code>. Это "заглушка", которая сообщает приложению, что ключ настроен на сервере.
                                </div>
                           </li>
                            <li>
                                <div>
                                     <code className="bg-gray-100 text-cyan-400 px-2 py-1 rounded">VITE_GEMINI_PROXY_URL</code>
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                    **(Конфигурация)** Вставьте значение <code className="bg-gray-100 px-1 rounded">/api/gemini-proxy</code>.
                                </div>
                           </li>
                        </ul>
                    </li>
                     <li>
                        Сохраните изменения. Render автоматически перезапустит сервис.
                    </li>
                </ol>
            </div>
            <p className="text-xs text-gray-500 mt-6">
                Эта ошибка отображается, потому что клиентская переменная <code className="bg-gray-100 text-gray-600 text-xs px-1 rounded">VITE_GEMINI_API_KEY</code> не была найдена в процессе сборки.
            </p>
        </div>
    </div>
);

export default ApiKeyErrorDisplay;