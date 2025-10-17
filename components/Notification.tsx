import React from 'react';
import { NotificationMessage } from '../types';
import { InfoIcon, SuccessIcon, ErrorIcon } from './icons';

type NotificationProps = Omit<NotificationMessage, 'id'>;

const Notification: React.FC<NotificationProps> = ({ message, type }) => {
    const config = {
        success: { border: 'border-success/30', bg: 'bg-green-500/10', text: 'text-success', icon: <SuccessIcon /> },
        error: { border: 'border-danger/30', bg: 'bg-red-500/10', text: 'text-danger', icon: <ErrorIcon /> },
        info: { border: 'border-info/30', bg: 'bg-blue-500/10', text: 'text-info', icon: <InfoIcon /> },
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