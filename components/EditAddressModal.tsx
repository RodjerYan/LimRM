import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { AggregatedDataRow } from '../types';
import { findAddressInRow } from '../utils/dataUtils';

interface EditAddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    rowData: AggregatedDataRow | null;
    onSave: (originalRow: AggregatedDataRow, newAddress: string) => void;
}

const EditAddressModal: React.FC<EditAddressModalProps> = ({ isOpen, onClose, rowData, onSave }) => {
    const [newAddress, setNewAddress] = useState('');
    const originalAddress = rowData ? (findAddressInRow(rowData.originalRows[0]) || '') : '';

    useEffect(() => {
        if (rowData) {
            setNewAddress(originalAddress);
        }
    }, [rowData, originalAddress]);

    const handleSave = () => {
        if (rowData && newAddress.trim()) {
            onSave(rowData, newAddress.trim());
        }
    };

    if (!isOpen || !rowData) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Редактирование адреса для: ${rowData.clientName}`}
        >
            <div className="space-y-4">
                <div>
                    <label htmlFor="original-address" className="block text-sm font-medium text-gray-400">
                        Исходный адрес (не редактируется)
                    </label>
                    <div
                        id="original-address"
                        className="mt-1 block w-full rounded-md bg-gray-800 border-gray-600 shadow-sm p-3 text-gray-400"
                    >
                        {originalAddress}
                    </div>
                </div>

                <div>
                    <label htmlFor="new-address" className="block text-sm font-medium text-white">
                        Новый или исправленный адрес
                    </label>
                    <input
                        type="text"
                        id="new-address"
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        className="mt-1 block w-full rounded-md bg-gray-900/50 border-gray-600 shadow-sm focus:border-accent focus:ring focus:ring-accent focus:ring-opacity-50 p-3"
                        placeholder="Например: г. Бишкек, ул. Киевская, 123"
                    />
                     <p className="mt-2 text-xs text-gray-400">
                        💡 **Совет:** Укажите город или населенный пункт для наиболее точного определения.
                    </p>
                </div>
                
                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={!newAddress.trim() || newAddress.trim() === originalAddress}
                        className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-6 rounded-lg transition duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        Сохранить и Перезапустить Анализ
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default EditAddressModal;
