
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
        <div className="relative group" ref={wrapperRef}>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider ml-1">{label}</label>
            <div className="relative">
                <input
                    type="text" value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); if (e.target.value === '') onChange(''); }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={`Все...`}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white transition-all duration-200 shadow-sm"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                     <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </div>
            </div>
            {isOpen && (
                <ul className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-fade-in-down origin-top">
                    <li onClick={() => { onChange(''); setInputValue(''); setIsOpen(false); }} className="px-4 py-2.5 text-gray-500 cursor-pointer hover:bg-gray-50 hover:text-gray-900 transition-colors text-sm border-b border-gray-100">Сбросить выбор</li>
                    {filteredOptions.map(opt => (
                        <li key={opt} onClick={() => { onChange(opt); setInputValue(opt); setIsOpen(false); }} className="px-4 py-2.5 text-gray-700 cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-sm">{opt}</li>
                    ))}
                    {filteredOptions.length === 0 && <li className="px-4 py-3 text-gray-400 text-xs text-center">Ничего не найдено</li>}
                </ul>
            )}
        </div>
    );
};

const MultiFilterSelect: React.FC<{
    label: string;
    selectedOptions: string[];
    options: string[];
    onChange: (selected: string[]) => void;
}> = ({ label, selectedOptions, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = useMemo(() => options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]);
    const handleToggleOption = (option: string) => onChange(selectedOptions.includes(option) ? selectedOptions.filter(item => item !== option) : [...selectedOptions, option]);
    
    const getDisplayValue = () => {
        if (selectedOptions.length === 0) return `Все`;
        if (selectedOptions.length === 1) return selectedOptions[0];
        if (selectedOptions.length === options.length) return `Все (${selectedOptions.length})`;
        return `Выбрано: ${selectedOptions.length}`;
    };

    return (
        <div className="relative group" ref={wrapperRef}>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider ml-1">{label}</label>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className={`w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left flex justify-between items-center transition-all duration-200 shadow-sm hover:bg-white hover:border-gray-300 ${isOpen ? 'ring-2 ring-indigo-500/50 border-indigo-500' : ''}`}>
                <span className={`truncate pr-1 ${selectedOptions.length > 0 ? 'text-indigo-600 font-medium' : 'text-gray-500'}`}>{getDisplayValue()}</span>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl animate-fade-in-down origin-top">
                    <div className="p-2 border-b border-gray-100">
                         <input type="text" placeholder="Поиск..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900 placeholder-gray-400 transition-colors" />
                    </div>
                     <div className="flex justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                        <button onClick={() => onChange(options)} className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors font-medium">Выбрать все</button>
                        <button onClick={() => onChange([])} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">Сбросить</button>
                    </div>
                    <ul className="max-h-52 overflow-y-auto custom-scrollbar p-1">
                        {filteredOptions.map(opt => (
                            <li key={opt} onClick={() => handleToggleOption(opt)} className="px-3 py-2 rounded-lg text-gray-700 cursor-pointer hover:bg-indigo-50 flex items-center select-none transition-colors">
                               <div className={`h-4 w-4 rounded border flex items-center justify-center mr-3 transition-colors ${selectedOptions.includes(opt) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-400 bg-white'}`}>
                                   {selectedOptions.includes(opt) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                               </div>
                                <span className="truncate text-sm">{opt}</span>
                            </li>
                        ))}
                        {filteredOptions.length === 0 && <li className="px-3 py-2 text-gray-400 text-xs text-center">Ничего не найдено</li>}
                    </ul>
                </div>
            )}
        </div>
    );
};

interface FiltersProps {
    options: FilterOptions;
    currentFilters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    onReset: () => void;
    disabled: boolean;
}

const Filters: React.FC<FiltersProps> = ({ options, currentFilters, onFilterChange, onReset, disabled }) => {
    
    const handleFilterUpdate = (key: keyof FilterState, value: string | string[]) => {
        onFilterChange({ ...currentFilters, [key]: value });
    };

    return (
        <div className={`relative z-40 group transition-opacity duration-300 h-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-white p-6 rounded-2xl border border-gray-200 shadow-xl h-full flex flex-col">
                
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 leading-tight">Фильтрация</h2>
                        <p className="text-xs text-gray-500">Настройка выборки данных</p>
                    </div>
                </div>

                <fieldset disabled={disabled} className="space-y-5 flex-grow">
                    <FilterSelect label="Региональный менеджер (РМ)" value={currentFilters.rm} options={options.rms} onChange={(val) => handleFilterUpdate('rm', val)} />
                    <MultiFilterSelect label="Торговая марка (Бренд)" selectedOptions={currentFilters.brand} options={options.brands} onChange={(val) => handleFilterUpdate('brand', val)} />
                    <MultiFilterSelect label="Фасовка (Упаковка)" selectedOptions={currentFilters.packaging} options={options.packagings} onChange={(val) => handleFilterUpdate('packaging', val)} />
                    <MultiFilterSelect label="Регион" selectedOptions={currentFilters.region} options={options.regions} onChange={(val) => handleFilterUpdate('region', val)} />
                </fieldset>
                
                <button
                    onClick={onReset}
                    className="w-full mt-6 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-600 hover:text-gray-900 font-medium py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center gap-2 group/reset"
                >
                    <svg className="w-4 h-4 text-gray-400 group-hover/reset:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    Сбросить все фильтры
                </button>
            </div>
        </div>
    );
};

export default Filters;
