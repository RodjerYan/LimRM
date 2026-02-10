
import React from 'react';
import { DataIcon, AnalyticsIcon, ProphetIcon, LabIcon, BrainIcon, TargetIcon } from './icons';

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
        <nav className="hidden lg:flex flex-col w-64 min-[1920px]:w-72 min-[2560px]:w-80 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 z-50 shadow-sm">
            <div className="p-6 flex items-center gap-3 border-b border-gray-100 shrink-0">
                <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center text-black font-bold shadow-sm">
                    L
                </div>
                <div>
                    <h1 className="font-bold text-gray-900 tracking-tight">
                        LimRM Group
                    </h1>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Analytics Core</p>
                </div>
            </div>
            
            <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                            activeTab === item.id 
                                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-sm' 
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                        <span className={`${activeTab === item.id ? 'text-yellow-600' : 'text-gray-400'}`}>
                            {item.icon}
                        </span>
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="p-4 border-t border-gray-100 shrink-0">
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-gray-700 font-medium">Система активна</span>
                    </div>
                    <div className="text-[10px] text-gray-400">Версия 2.5.0 (White Ed.)</div>
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
