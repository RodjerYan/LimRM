
import React from 'react';
import { DataIcon, AnalyticsIcon, ProphetIcon, LabIcon, BrainIcon, TargetIcon } from './components/icons';

interface NavigationProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
    const navItems = [
        { id: 'adapta', label: 'ADAPTA (Данные)', icon: <DataIcon small /> },
        { id: 'amp', label: 'AMP (Аналитика)', icon: <AnalyticsIcon small /> },
        { id: 'dashboard', label: 'Дашборд План/Факт', icon: <TargetIcon small /> },
        { id: 'prophet', label: 'PROPHET (Прогноз)', icon: <ProphetIcon small /> },
        { id: 'agile', label: 'AGILE LEARNING', icon: <LabIcon small /> },
        { id: 'roi-genome', label: 'ROI GENOME', icon: <BrainIcon small /> },
    ];

    return (
        <nav className="hidden lg:flex flex-col w-64 bg-gray-900/90 backdrop-blur-xl border-r border-gray-800 h-screen fixed left-0 top-0 z-50">
            <div className="p-6 flex items-center gap-3 border-b border-gray-800 shrink-0">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold">
                    G
                </div>
                <div>
                    <h1 className="font-bold text-white tracking-tight">
                        GPS-Enterprise
                    </h1>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Коммерческая аналитика LimKorm</p>
                </div>
            </div>
            
            <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                            activeTab === item.id 
                                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-900/20' 
                                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                    >
                        <span className={`${activeTab === item.id ? 'text-indigo-400' : 'text-gray-500'}`}>
                            {item.icon}
                        </span>
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="p-4 border-t border-gray-800 shrink-0">
                <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-500 border border-gray-700">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-gray-300">Система активна</span>
                    </div>
                    <div className="text-[10px]">Версия 2.5.0 (by RodjerYan)</div>
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
