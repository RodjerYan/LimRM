
import React from 'react';

const ApiKeyErrorDisplay: React.FC = () => (
    <div className="flex items-center justify-center h-screen p-4">
        <div className="bg-card-bg/70 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-danger/50 max-w-4xl text-center">
            <h1 className="text-3xl font-bold text-danger mb-4">Ошибка Конфигурирования Сервера</h1>
            <p className="text-lg text-slate-300 mb-6">
                Приложение не может запуститься, так как не настроены переменные окружения или права доступа.
            </p>
            <div className="text-left bg-gray-900/50 p-6 rounded-lg border border-gray-700">
                <p className="font-semibold text-white mb-3">Чек-лист для Vercel:</p>
                <ol className="list-decimal list-inside space-y-3 text-slate-400">
                    <li>
                        <strong>Google Service Account Key:</strong>
                        <p className="ml-4 text-sm mt-1 text-slate-500">
                            Проверьте переменную <code>GOOGLE_SERVICE_ACCOUNT_KEY</code>.
                            Вставьте <strong>весь</strong> JSON-файл целиком (начинается с <code>{'{'}</code> и заканчивается <code>{'}'}</code>).
                            <br/>
                            <span className="text-amber-400">Совет:</span> Если возникают ошибки парсинга (особенно с переносами строк), попробуйте закодировать весь JSON в <strong>Base64</strong> и вставить полученную строку. Система поддерживает оба формата.
                        </p>
                    </li>
                    <li>
                        <strong>Доступ к Google Drive / Sheets:</strong>
                        <p className="ml-4 text-sm mt-1 text-slate-500">
                            Откройте файл JSON ключа, найдите поле <code>client_email</code>.
                            Скопируйте этот email и дайте ему доступ <strong>"Редактор"</strong> к:
                            <ul className="list-disc list-inside ml-2 mt-1">
                                <li>Таблице с базой ОКБ (ID: <code>13Hkru...</code>)</li>
                                <li>Таблице с кэшем (ID: <code>1peEj5...</code>)</li>
                                <li>Папке для снепшотов (ID: <code>15Mu4B...</code>)</li>
                                <li>Папкам с данными 2025/2026 (ID: <code>1uJX1d...</code>, <code>1S3O-kl...</code>)</li>
                            </ul>
                        </p>
                    </li>
                    <li>
                        <strong>API Keys:</strong>
                        <p className="ml-4 text-sm mt-1 text-slate-500">
                            Убедитесь, что заданы <code>API_KEY_1</code> ... <code>API_KEY_4</code> для работы Gemini.
                        </p>
                    </li>
                     <li>
                        <strong>Redeploy:</strong>
                        <p className="ml-4 text-sm mt-1 text-slate-500">
                            После изменения переменных обязательно сделайте <strong>Redeploy</strong> в Vercel.
                        </p>
                    </li>
                </ol>
            </div>
        </div>
    </div>
);

export default ApiKeyErrorDisplay;
