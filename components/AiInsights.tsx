import React from 'react';
import { AiAnalysisResult } from '../types';
import { LoaderIcon } from './icons';

interface AiInsightsProps {
    data: AiAnalysisResult | null;
    isLoading: boolean;
}

const SkeletonLoader: React.FC = () => (
    <div className="space-y-4 shimmer-effect p-1">
        <div className="h-4 bg-gray-700/50 rounded w-3/4"></div>
        <div className="space-y-2">
            <div className="h-3 bg-gray-700/50 rounded w-full"></div>
            <div className="h-3 bg-gray-700/50 rounded w-5/6"></div>
        </div>
        <div className="h-4 bg-gray-700/50 rounded w-1/2 mt-4"></div>
        <div className="space-y-2">
            <div className="h-3 bg-gray-700/50 rounded w-full"></div>
            <div className="h-3 bg-gray-700/50 rounded w-full"></div>
        </div>
    </div>
);

const LeaderList: React.FC<{ title: string; items: { name: string, value: string }[] }> = ({ title, items }) => (
    <div>
        <h4 className="font-semibold text-accent mb-2">{title}</h4>
        <ul className="space-y-1.5 text-sm">
            {items.map((item, index) => (
                <li key={index} className="flex justify-between items-center">
                    <span className="text-gray-300 truncate pr-2">{index + 1}. {item.name}</span>
                    <span className="font-mono text-gray-400 flex-shrink-0">{item.value}</span>
                </li>
            ))}
        </ul>
    </div>
);


const AiInsights: React.FC<AiInsightsProps> = ({ data, isLoading }) => {
    if (!data && !isLoading) {
        return null; // Don't render anything if there's no data and not loading
    }
    
    return (
        <div className="bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-3">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">
                    {isLoading ? <LoaderIcon/> : 'AI'}
                </span>
                AI-Аналитик: Сводка
            </h2>

            {isLoading ? (
                <SkeletonLoader />
            ) : data ? (
                <div className="space-y-6">
                    <div>
                        <h3 className="font-semibold text-accent mb-2">Ключевые выводы</h3>
                        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
                           {data.insights.map((insight, index) => (
                               <li key={index}>{insight}</li>
                           ))}
                        </ul>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center border-t border-border-color pt-4">
                        <div >
                            <p className="text-xs text-gray-400">РМ</p>
                            <p className="text-xl font-bold text-white">{data.summary.unique_rms}</p>
                        </div>
                         <div >
                            <p className="text-xs text-gray-400">Бренды</p>
                            <p className="text-xl font-bold text-white">{data.summary.unique_brands}</p>
                        </div>
                         <div >
                            <p className="text-xs text-gray-400">Регионы</p>
                            <p className="text-xl font-bold text-white">{data.summary.unique_regions}</p>
                        </div>
                    </div>

                    <div className="space-y-4 border-t border-border-color pt-4">
                        {data.leaders.top_managers.length > 0 && <LeaderList title="Топ РМ" items={data.leaders.top_managers} />}
                        {data.leaders.top_brands.length > 0 && <LeaderList title="Топ Бренды" items={data.leaders.top_brands} />}
                        {data.leaders.top_regions.length > 0 && <LeaderList title="Топ Регионы" items={data.leaders.top_regions} />}
                    </div>

                </div>
            ) : (
                <p className="text-sm text-gray-500 italic">Не удалось получить данные от AI-аналитика.</p>
            )}
        </div>
    );
};

export default AiInsights;