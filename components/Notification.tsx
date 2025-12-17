
import React from 'react';
import { NotificationMessage } from '../types';
import { InfoIcon, SuccessIcon, ErrorIcon, WarningIcon } from './icons';

type NotificationProps = Omit<NotificationMessage, 'id'>;

const Notification: React.FC<NotificationProps> = ({ message, type }) => {
    const config = {
        success: { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-success', icon: <SuccessIcon /> },
        error: { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-danger', icon: <ErrorIcon /> },
        info: { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400', icon: <InfoIcon /> },
        warning: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-warning', icon: <WarningIcon /> },
    };

    const { bg, border, text, icon } = config[type];

    return (
        <div className={`p-4 rounded-lg shadow-xl border ${border} ${bg} backdrop-blur-md text-white transition-all duration-300 ease-in-out animate-fade-in-right`}>
            <div className="flex items-center">
                <div className={`w-5 h-5 mr-3 flex-shrink-0 ${text}`}>{icon}</div>
                <span className="text-sm text-gray-200">{message}</span>
            </div>
        </div>
    );
};

export default Notification;