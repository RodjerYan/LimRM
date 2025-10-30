// components/GrokAnalyzer.tsx
import React, { useState } from 'react';
import { analyzeAddresses } from '../services/addressAnalyzer';
import { LoaderIcon } from './icons';

// Sample data from user's previous prompts for a quick test
const sampleAddresses = [
    "г.Макеевка , ул Малиновского 61",
    "г. Донецк пр. Дзержинского",
    "г. Мариуполь, пр. Строителей, 60",
    "283058, Донецкая Народная респ., г.о. Донецк, г. Донецк, пр-кт Дзержинского",
    "г. Мелитополь, ул. Ленина 136",
    "г. Геническ, ул. Центральная 27",
    "г. Луганск, кв. Героев Брестской Крепости",
    "г. Алчевск, ул. Гмыри",
    "г.Макеевка, еще один адрес",
];

const GrokAnalyzer: React.FC = () => {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeAddresses(sampleAddresses);
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10">
      <h2 className="text-xl font-bold mb-4 text-white">Grok Анализатор Адресов</h2>
      <p className="text-sm text-gray-400 mb-4">
        Нажмите кнопку, чтобы отправить первые 250 адресов из файла на анализ в Grok для получения рекомендаций по логистике и группировке.
      </p>
      <button 
        onClick={runAnalysis} 
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2.5 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2"
      >
        {loading ? (
            <>
                <LoaderIcon />
                <span>Анализ...</span>
            </>
        ) : (
            'Запустить анализ Grok'
        )}
      </button>

      {error && (
        <div className="mt-4 bg-red-900/50 border border-danger p-3 rounded-lg text-danger text-sm">
            <p className="font-bold">Ошибка:</p>
            <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4">
            <h3 className="font-bold text-lg mb-2 text-accent">Результаты анализа:</h3>
            <pre className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 text-xs text-slate-300 overflow-x-auto custom-scrollbar">
                {JSON.stringify(result, null, 2)}
            </pre>
        </div>
      )}
    </div>
  );
};

export default GrokAnalyzer;
