import React from 'react';
import { AggregatedDataRow } from '../types';
import { findAddressInRow } from '../utils/dataUtils';

interface UnidentifiedAddressesTableProps {
    data: AggregatedDataRow[];
    onEditRow: (row: AggregatedDataRow) => void;
}

const UnidentifiedAddressesTable: React.FC<UnidentifiedAddressesTableProps> = ({ data, onEditRow }) => {
    if (data.length === 0) {
        return null;
    }

    return (
        <div className="bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-yellow-500/20">
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-warning flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Неопределенные адреса ({data.length})
                </h2>
                <p className="text-sm text-gray-400 mt-1">Для этих записей не удалось автоматически определить регион. Уточните адрес для корректного анализа.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/70">
                        <tr>
                            <th scope="col" className="px-4 py-3">Исходный адрес / Наименование</th>
                            <th scope="col" className="px-4 py-3">РМ</th>
                            <th scope="col" className="px-4 py-3">Бренд</th>
                            <th scope="col" className="px-4 py-3 text-center">Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.key} className="border-b border-gray-700 hover:bg-yellow-500/10">
                                <td scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap" title={findAddressInRow(row.originalRows[0]) ?? row.clientName}>
                                    {row.clientName}
                                </td>
                                <td className="px-4 py-3">{row.rm}</td>
                                <td className="px-4 py-3">{row.brand}</td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => onEditRow(row)}
                                        className="font-medium text-accent hover:underline"
                                    >
                                        Уточнить адрес
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UnidentifiedAddressesTable;