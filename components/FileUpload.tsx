
import React, { useState, useCallback } from 'react';
import { OkbStatus, FileProcessingState, CloudLoadParams } from '../types';
import { formatETR } from '../utils/timeUtils';
import { DataIcon, LoaderIcon } from './icons';

interface FileUploadProps {
    // New Props from Global State
    processingState: FileProcessingState;
    onStartProcessing: (file: File) => void;
    // Updated: Callback for cloud processing takes an object
    onStartCloudProcessing?: (params: CloudLoadParams) => void;
    
    okbStatus: OkbStatus | null;
    disabled: boolean;
}

type PeriodType = 'year' | 'quarter' | 'month';

const FileUpload: React.FC<FileUploadProps> = ({ processingState, onStartProcessing, onStartCloudProcessing, okbStatus, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [mode, setMode] = useState<'file' | 'cloud'>('file');
    
    // Cloud Selection State
    const [selectedYear, setSelectedYear] = useState<string>('2025');
    const [periodType, setPeriodType] = useState<PeriodType>('year');
    const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
    const [selectedMonth, setSelectedMonth] = useState<number>(1); // 1 = Jan

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onStartProcessing(file);
        }
        event.target.value = '';
    }, [onStartProcessing]);

    const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled || mode === 'cloud') return;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled || mode === 'cloud') return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onStartProcessing(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    }, [onStartProcessing, disabled, mode]);

    const handleLoadClick = () => {
        if (!onStartCloudProcessing) return;
        
        const params: CloudLoadParams = { year: selectedYear };
        
        if (periodType === 'quarter') {
            params.quarter = selectedQuarter;
        } else if (periodType === 'month') {
            params.month = selectedMonth;
        }
        
        onStartCloudProcessing(params);
    };

    const getLoadButtonText = () => {
        if (periodType === 'year') return `Загрузить ${selectedYear} год`;
        if (periodType === 'quarter') return `Загрузить Q${selectedQuarter} ${selectedYear}`;
        const monthName = new Date(0,