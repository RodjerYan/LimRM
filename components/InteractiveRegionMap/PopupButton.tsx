
import React from 'react';
import { MapPoint } from '../../types';

export const PopupButton: React.FC<{ client: MapPoint; onEdit: (client: MapPoint) => void }> = ({ client, onEdit }) => {
    return (
        <button
            onClick={() => onEdit(client)}
            className="group mt-3 w-full bg-black hover:bg-gray-800 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
        >
            <svg className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            Редактировать адрес
        </button>
    );
};