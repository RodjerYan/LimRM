import React from 'react';
import { AggregatedDataRow } from '../types';
import { exportToCSV, exportToXLSX, exportToPDF } from '../utils/dataUtils';
import { ExportIcon } from './icons';

interface ExportControlsProps {
    data: AggregatedDataRow[];
    disabled: boolean;
}

const ExportControls: React.FC<ExportControlsProps> = ({ data, disabled }) => {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 mr-2 flex items-center gap-2">
                <ExportIcon/> Экспорт:
            </span>
            <button
                onClick={() => exportToCSV(data)}
                disabled={disabled}
                className="bg-transparent hover:bg-indigo-500/20 text-gray-300 border border-gray-600 font-semibold py-2 px-3 rounded-lg transition duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
                CSV
            </button>
            <button
                onClick={() => exportToXLSX(data)}
                disabled={disabled}
                className="bg-transparent hover:bg-indigo-500/20 text-gray-300 border border-gray-600 font-semibold py-2 px-3 rounded-lg transition duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
                XLSX
            </button>
            <button
                onClick={() => exportToPDF(data)}
                disabled={disabled}
                className="bg-transparent hover:bg-indigo-500/20 text-gray-300 border border-gray-600 font-semibold py-2 px-3 rounded-lg transition duration-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
                PDF
            </button>
        </div>
    );
};

export default ExportControls;