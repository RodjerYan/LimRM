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
        if (selectedOptions.length === 0) return `Поиск и выбор (${label})...`;
        if (selectedOptions.length === 1) return selectedOptions[0];
        if (selectedOptions.length === options.length) return `Выбраны все (${selectedOptions.length})`;
        return `Выбрано: ${selectedOptions.length}`;
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full p-2.5 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-white text-left flex justify-between items-center transition">
                <span className="truncate pr-1">{getDisplayValue()}</span>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-card-bg/80 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg">
                    <div className="p-2 border-b border-gray-700">
                         <input type="text" placeholder="Поиск..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 bg-gray-900/70 border border-gray-600 rounded-md focus:ring-2 focus:ring-accent focus:border-accent text-white placeholder-gray-500" />
                    </div>
                     <div className="flex justify-between px-3 py-2 border-b border-gray-700">
                        <button onClick={() => onChange(options)} className="text-xs text-accent hover:text-white transition-colors">Выбрать все</button>
                        <button onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-white transition-colors">Очистить</button>
                    </div>
                    <ul className="max-h-52 overflow-y-auto custom-scrollbar">
                        {filteredOptions.map(opt => (
                            <li key={opt} onClick={() => handleToggleOption(opt)} className="px-3 py-2 text-white cursor-pointer hover:bg-indigo-500/20 flex items-center select-none">
                               <input type="checkbox" readOnly checked={selectedOptions.includes(opt)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-accent focus:ring-accent mr-3 pointer-events-none" />
                                <span className="truncate">{opt}</span>
                            </li>
                        ))}
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
        <div className={`relative z-20 bg-card-bg/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-indigo-500/10 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                <span className="bg-accent text-white text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center">2</span>
                Фильтры
            </h2>
            <fieldset disabled={disabled} className="space-y-4">
                <FilterSelect label="РМ" value={currentFilters.rm} options={options.rms} onChange={(val) => handleFilterUpdate('rm', val)} />
                <MultiFilterSelect label="Бренд" selectedOptions={currentFilters.brand} options={options.brands} onChange={(val) => handleFilterUpdate('brand', val)} />
                {/* REVERT: Changed from Region to City */}
                <MultiFilterSelect label="Город" selectedOptions={currentFilters.city} options={options.cities} onChange={(val) => handleFilterUpdate('city', val)} />
                
                <button
                    onClick={onReset}
                    className="w-full mt-5 bg-transparent hover:bg-indigo-500/20 text-gray-300 border border-gray-600 font-bold py-2.5 px-4 rounded-lg transition duration-200"
                >
                    Сбросить фильтры
                </button>
            </fieldset>
        </div>
    );
};

export default Filters;