
import React from 'react';
import { NotificationMessage } from '../types';
import { InfoIcon, SuccessIcon, ErrorIcon, WarningIcon } from './icons';

type NotificationProps = Omit<NotificationMessage, 'id'>;

const Notification: React.FC<NotificationProps> = ({ message, type }) => {
    const config = {
        success: { 
            bg: 'bg-emerald-50/95', 
            border: 'border-emerald-200', 
            text: 'text-emerald-900', 
            iconColor: 'text-emerald-500', 
            shadow: 'shadow-emerald-500/10',
            icon: <SuccessIcon /> 
        },
        error: { 
            bg: 'bg-red-50/95', 
            border: 'border-red-200', 
            text: 'text-red-900', 
            iconColor: 'text-red-500', 
            shadow: 'shadow-red-500/10',
            icon: <ErrorIcon /> 
        },
        info: { 
            bg: 'bg-white/95', 
            border: 'border-indigo-200', 
            text: 'text-indigo-900', 
            iconColor: 'text-indigo-500', 
            shadow: 'shadow-indigo-500/10',
            icon: <InfoIcon /> 
        },
        warning: { 
            bg: 'bg-amber-50/95', 
            border: 'border-amber-200', 
            text: 'text-amber-900', 
            iconColor: 'text-amber-500', 
            shadow: 'shadow-amber-500/10',
            icon: <WarningIcon /> 
        },
    };

    const { bg, border, text, iconColor, shadow, icon } = config[type];

    return (
        <div className={`flex items-center gap-3 p-4 pr-6 rounded-2xl border ${border} ${bg} ${shadow} backdrop-blur-xl shadow-lg transition-all duration-300 ease-in-out animate-fade-in-right`}>
            <div className={`w-5 h-5 flex-shrink-0 ${iconColor}`}>
                {icon}
            </div>
            <span className={`text-sm font-bold ${text} tracking-tight`}>{message}</span>
        </div>
    );
};

export default Notification;
