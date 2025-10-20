import React, { useState } from 'react';
import { RocketIcon } from './icons';

const WhatIfScenario: React.FC = () => {
    const [growth, setGrowth] = useState(15);
    const [efficiency, setEfficiency] = useState(5);

    return (
        <div className="bg-indigo-900/30 border border-accent/30 p-6 rounded-2xl">
            <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <RocketIcon />
                What-If Анализ
            </h3>
            <div className="space-y-4">
                <div>
                    <label htmlFor="growth" className="block text-sm font-medium text-gray-300">
                        Если увеличить долю рынка на <span className="text-accent font-bold">{growth}%</span>
                    </label>
                    <input
                        id="growth"
                        type="range"
                        min="5"
                        max="50"
                        value={growth}
                        onChange={(e) => setGrowth(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                </div>
                 <div>
                    <label htmlFor="efficiency" className="block text-sm font-medium text-gray-300">
                        И повысить эффективность работы с ТТ на <span className="text-accent font-bold">{efficiency}%</span>
                    </label>
                    <input
                        id="efficiency"
                        type="range"
                        min="1"
                        max="25"
                        value={efficiency}
                        onChange={(e) => setEfficiency(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                </div>
                <div className="text-center pt-2">
                    <p className="text-gray-400">Прогнозный доп. объем составит:</p>
                    <p className="text-3xl font-bold text-success animate-pulse">
                        ~{Math.round(growth * efficiency * 1234 / 100).toLocaleString('ru-RU')} кг/ед
                    </p>
                </div>
            </div>
        </div>
    );
};

export default WhatIfScenario;
