import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FilterOptions, FilterState } from '../types';

const FilterSelect: React.FC<{
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => {
    const [inputValue, setInputValue] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) setInputValue(value);
    }, [value, isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = useMemo(() => options.filter(opt => opt.toLowerCase().includes(inputValue.toLowerCase())), [options, inputValue]);

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
            <div className="relative">
                <input
                    type="text" value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); if (e.target.value === '') onChange(''); }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={`Поиск и выбор (${label})...`}
                    className="w-full p-2.5 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500 transition"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                     <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </div>
            </div>
            {isOpen && (
                <ul className="absolute z-50 w-full mt-1 bg-card-bg/80 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                    <li onClick={() => { onChange(''); setInputValue(''); setIsOpen(false); }} className="px-4 py-2 text-gray-300 cursor-pointer hover:bg-indigo-500/20">Все</li>
                    {filteredOptions.map(opt => (
                        <li key={opt} onClick={() => { onChange(opt); setInputValue(opt); setIsOpen(false); }} className="px-4 py-2 text-white cursor-pointer hover:bg-indigo-500/20">{opt}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};

interface FiltersProps {
    options: FilterOptions;
    currentFilters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    onReset: () => void;
    onOpenAnalysisModal: () => void;
    disabled: boolean;
}

const Filters: React.FC<FiltersProps> = ({ options, currentFilters, onFilterChange, onReset, onOpenAnalysisModal, disabled }) => {
    
    const handleRmChange = (value: string) => {
        onFilterChange({ rm: value });
    };

    const isRmSelected = !!currentFilters.rm;

    return (
        <div className={`relative z-20 bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">2</span>
                Фильтры
            </h2>
            <fieldset disabled={disabled} className="space-y-4">
                <FilterSelect label="РМ" value={currentFilters.rm} options={options.rms} onChange={handleRmChange} />
                
                <div className="pt-2 space-y-3">
                    <button
                        onClick={onOpenAnalysisModal}
                        disabled={!isRmSelected}
                        className="w-full bg-accent hover:bg-accent-dark disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400 text-white font-bold py-2.5 px-4 rounded-lg transition duration-200"
                    >
                        Детальный анализ
                    </button>
                    <button
                        onClick={onReset}
                        className="w-full bg-transparent hover:bg-indigo-500/20 text-gray-300 border border-gray-600 font-bold py-2.5 px-4 rounded-lg transition duration-200"
                    >
                        Сбросить фильтр
                    </button>
                </div>
            </fieldset>
        </div>
    );
};

export default Filters;