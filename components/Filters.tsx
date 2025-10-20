import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FilterOptions, FilterState } from '../types';
import { UserIcon, TagIcon, MapPinIcon, ResetIcon } from './icons';

// A small component to display selected filter items as pills
const FilterPill: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
    <div className="bg-accent/80 text-white text-xs font-medium flex items-center rounded-full pl-2.5 pr-1 py-0.5 animate-scale-in">
        <span className="truncate max-w-[100px]">{label}</span>
        <button
            onClick={(e) => {
                e.stopPropagation(); // Prevent dropdown from opening
                onRemove();
            }}
            className="ml-1.5 flex-shrink-0 rounded-full hover:bg-white/20 transition-colors p-0.5"
            aria-label={`Удалить ${label}`}
        >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
        </button>
    </div>
);

const MultiFilterSelect: React.FC<{
    label: string;
    icon: React.ReactNode;
    selectedOptions: string[];
    options: string[];
    onChange: (selected: string[]) => void;
}> = ({ label, icon, selectedOptions, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);
    
    // Reset search term when dropdown opens/closes
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
        }
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        return options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [options, searchTerm]);

    const handleToggleOption = (option: string) => {
        const newSelection = selectedOptions.includes(option)
            ? selectedOptions.filter(item => item !== option)
            : [...selectedOptions, option];
        onChange(newSelection);
    };
    
    const handleSelectAll = () => onChange(options);
    const handleDeselectAll = () => onChange([]);

    const renderDisplayValue = () => {
        if (selectedOptions.length === 0) return <span className="text-gray-400">Поиск и выбор ({label})...</span>;
        if (selectedOptions.length > 0 && selectedOptions.length <= 2) {
            return (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedOptions.map(opt => (
                        <FilterPill key={opt} label={opt} onRemove={() => handleToggleOption(opt)} />
                    ))}
                </div>
            );
        }
        if (selectedOptions.length === options.length && options.length > 0) return <span className="font-medium text-white">Выбраны все ({selectedOptions.length})</span>;
        return <span className="font-medium text-white">Выбрано: {selectedOptions.length}</span>;
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-2.5 bg-gray-900/50 border border-border-color rounded-lg focus-within:ring-2 focus-within:ring-accent-focus focus-within:border-accent text-white flex items-center gap-3 transition cursor-pointer"
            >
                <div className="text-gray-400 flex-shrink-0">{icon}</div>
                <div className="flex-grow min-w-0">{renderDisplayValue()}</div>
                <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-card-bg/95 backdrop-blur-md border border-border-color rounded-lg shadow-lg animate-fade-in">
                    <div className="p-2 border-b border-border-color">
                         <input
                            type="text"
                            placeholder="Поиск..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full p-2 bg-gray-900/70 border border-gray-600 rounded-md focus:ring-2 focus:ring-accent-focus focus:border-accent text-white placeholder-gray-500"
                        />
                    </div>
                     <div className="flex justify-between px-3 py-2 border-b border-border-color">
                        <button onClick={handleSelectAll} className="text-xs text-accent hover:text-accent-hover transition-colors">Выбрать все</button>
                        <button onClick={handleDeselectAll} className="text-xs text-gray-400 hover:text-white transition-colors">Очистить</button>
                    </div>
                    <ul className="max-h-52 overflow-y-auto custom-scrollbar">
                        {filteredOptions.length > 0 ? filteredOptions.map(opt => (
                            <li
                                key={opt}
                                onClick={() => handleToggleOption(opt)}
                                className="px-3 py-2 text-white cursor-pointer hover:bg-accent/20 flex items-center select-none"
                            >
                               <div className={`w-4 h-4 rounded border-2 flex-shrink-0 mr-3 flex items-center justify-center ${selectedOptions.includes(opt) ? 'bg-accent border-accent' : 'border-gray-500 bg-gray-700'}`}>
                                    {selectedOptions.includes(opt) && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>}
                               </div>
                                <span className="truncate">{opt}</span>
                            </li>
                        )) : (
                             <li className="px-4 py-2 text-gray-500 italic">Ничего не найдено</li>
                        )}
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
    
    const areFiltersActive = currentFilters.rm.length > 0 || currentFilters.brand.length > 0 || currentFilters.city.length > 0;

    return (
        <div className={`relative z-20 bg-card-bg/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-border-color transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-xl font-bold mb-5 text-white">Фильтры</h2>
            <fieldset disabled={disabled} className="space-y-4">
                <MultiFilterSelect label="РМ" icon={<UserIcon />} selectedOptions={currentFilters.rm} options={options.rms} onChange={(val) => handleFilterUpdate('rm', val)} />
                <MultiFilterSelect label="Бренд" icon={<TagIcon />} selectedOptions={currentFilters.brand} options={options.brands} onChange={(val) => handleFilterUpdate('brand', val)} />
                <MultiFilterSelect label="Регион" icon={<MapPinIcon />} selectedOptions={currentFilters.city} options={options.cities} onChange={(val) => handleFilterUpdate('city', val)} />
                
                <button
                    onClick={onReset}
                    disabled={!areFiltersActive}
                    className="w-full mt-5 bg-gradient-to-r from-accent to-purple-600 hover:from-accent-hover hover:to-purple-500 text-white font-bold py-2.5 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-accent/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-500 disabled:to-gray-600 disabled:shadow-none"
                >
                    <ResetIcon />
                    Сбросить все фильтры
                </button>
            </fieldset>
        </div>
    );
};

export default Filters;