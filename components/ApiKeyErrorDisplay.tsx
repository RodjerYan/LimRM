import React from 'react';

const MissingKeyInstructions = () => (
    <>
        <h1 className="text-3xl font-bold text-danger mb-4">Ошибка Конфигурации</h1>
        <p className="text-lg text-slate-300 mb-6">
            Приложение не может запуститься, так как не настроены переменные окружения.
        </p>
        <div className="text-left bg-gray-900/50 p-6 rounded-lg border border-gray-700">
            <p className="font-semibold text-white mb-3">Как это исправить (для Vercel):</p>
            <div className="bg-red-900/40 border border-danger/50 p-3 rounded-md mb-4">
                <p className="font-bold text-danger">Внимание!</p>
                <p className="text-slate-300 text-sm">
                    Вам нужно настроить **ЧЕТЫРЕ** переменные. Прочтите инструкцию внимательно, особенно про относительные пути для прокси.
                </p>
            </div>
            <ol className="list-decimal list-inside space-y-4 text-slate-400">
                <li>
                    Перейдите в <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Google AI Studio</a> и создайте новый ключ API.
                </li>
                <li>
                    В настройках вашего проекта на Vercel откройте вкладку <code className="bg-gray-900 text-gray-300 px-1 py-0.5 rounded mx-1">Settings</code> → <code className="bg-gray-900 text-gray-300 px-1 py-0.5 rounded mx-1">Environment Variables</code>.
                </li>
                <li>
                    **(Серверный Секрет)** Создайте переменную <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">API_KEY</code> и вставьте в нее ваш настоящий ключ API от Google (начинается с `AIza...`).
                </li>
                <li>
                    **(Клиентский Флаг)** Создайте переменную <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">VITE_GEMINI_API_KEY</code> и вставьте в нее **текст-заглушку**, например, <code className="bg-gray-900 text-gray-300 px-1 py-0.5 rounded mx-1">key_is_set_on_server</code>.
                </li>
                 <li className="font-bold text-amber-400">
                    **(Прокси Gemini)** Создайте переменную <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">VITE_GEMINI_PROXY_URL</code> и установите значение <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">/api/gemini-proxy</code>. Это должен быть **относительный путь**.
                </li>
                <li className="font-bold text-amber-400">
                     **(Прокси OSM)** Создайте переменную <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">VITE_OSM_PROXY_URL</code> и установите значение <code className="bg-gray-900 text-accent px-1 py-0.5 rounded mx-1">/api/osm-proxy</code>. Это также **относительный путь**.
                </li>
                <li>
                    Убедитесь, что все переменные доступны для всех окружений (Production, Preview, Development).
                </li>
                <li>
                    Сохраните и <strong>перезапустите развертывание (Redeploy)</strong> вашего проекта, чтобы изменения вступили в силу.
                </li>
            </ol>
             <div className="bg-blue-900/40 border border-blue-500/50 p-3 rounded-md mt-4 text-sm">
                <p className="font-bold text-blue-300">Примечание о прокси</p>
                <p className="text-slate-300 text-xs mt-1">
                    Эти переменные (`VITE_..._PROXY_URL`) используются как флаг для проверки завершенности настройки. Для максимальной стабильности приложение будет использовать внутренне заданные пути (`/api/...`), чтобы избежать ошибок CORS.
                </p>
            </div>
        </div>
        <p className="text-xs text-gray-500 mt-6">
            Эта ошибка отображается, потому что одна из клиентских переменных (`VITE_...`) не была найдена.
        </p>
    </>
);

const SwappedKeyError = () => (
     <>
        <h1 className="text-3xl font-bold text-danger mb-4">Критическая Ошибка: Ключи API перепутаны!</h1>
        <p className="text-lg text-slate-300 mb-6">
            В клиентскую переменную <code className="bg-red-900/50 text-red-300 px-1 rounded mx-1">VITE_GEMINI_API_KEY</code> был вставлен настоящий, секретный ключ API. Это небезопасно и не позволит приложению работать.
        </p>
        <div className="text-left bg-gray-900/50 p-6 rounded-lg border-2 border-danger">
            <p className="font-semibold text-white mb-3 text-xl">Как это исправить:</p>
            <p className="text-amber-400 mb-4">Вам нужно поменять значения двух переменных в настройках Vercel.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-900/40 border border-success/50 p-4 rounded-md">
                    <p className="font-bold text-success text-lg">ПРАВИЛЬНО (для сервера)</p>
                    <p className="text-sm mt-2">Имя переменной:</p>
                    <code className="bg-gray-900 text-accent px-2 py-1 rounded my-1 inline-block text-base">API_KEY</code>
                    <p className="text-sm mt-2">Значение:</p>
                    <p className="bg-gray-900 text-gray-300 px-2 py-1 rounded my-1 text-sm truncate">AIzaSy... (Ваш настоящий ключ от Google)</p>
                </div>
                <div className="bg-red-900/40 border border-danger/50 p-4 rounded-md">
                    <p className="font-bold text-danger text-lg">НЕПРАВИЛЬНО (для клиента)</p>
                     <p className="text-sm mt-2">Имя переменной:</p>
                    <code className="bg-gray-900 text-accent px-2 py-1 rounded my-1 inline-block text-base">VITE_GEMINI_API_KEY</code>
                    <p className="text-sm mt-2">Значение:</p>
                    <p className="bg-gray-900 text-gray-300 px-2 py-1 rounded my-1 text-sm">key_is_set_on_server</p>
                </div>
            </div>

             <ol className="list-decimal list-inside space-y-3 text-slate-400 mt-6">
                <li>
                    Перейдите в настройки вашего проекта на Vercel во вкладку <code className="bg-gray-800 px-1 rounded">Environment Variables</code>.
                </li>
                <li>
                    Найдите переменную <code className="bg-gray-800 text-accent px-1 rounded">API_KEY</code> и убедитесь, что ее значение — это ваш **настоящий** ключ API.
                </li>
                <li>
                    Найдите переменную <code className="bg-gray-800 text-accent px-1 rounded">VITE_GEMINI_API_KEY</code> и убедитесь, что ее значение — это **текст-заглушка**, например, <code className="bg-gray-800 text-white px-1 rounded">key_is_set_on_server</code>.
                </li>
                 <li>
                    Сохраните изменения и **перезапустите развертывание (Redeploy)**.
                </li>
            </ol>
        </div>
    </>
);


interface ApiKeyErrorDisplayProps {
    errorType: 'missing' | 'swapped';
}

const ApiKeyErrorDisplay: React.FC<ApiKeyErrorDisplayProps> = ({ errorType }) => (
    <div className="flex items-center justify-center h-screen p-4">
        <div className="bg-card-bg/70 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-danger/50 max-w-4xl text-center">
            {errorType === 'swapped' ? <SwappedKeyError /> : <MissingKeyInstructions />}
        </div>
    </div>
);

export default ApiKeyErrorDisplay;