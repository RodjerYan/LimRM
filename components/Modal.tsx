
import React, { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
    zIndex?: string; // New prop for stacking control
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, maxWidth = 'max-w-7xl', zIndex = 'z-[9999]' }) => {

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);

        return () => {
            window.removeEventListener('keydown', handleEsc);
        };
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div 
            className={`fixed inset-0 bg-black/80 ${zIndex} flex justify-center items-center p-4 animate-fade-in`}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div 
                className={`bg-card-bg/80 backdrop-blur-lg rounded-2xl shadow-2xl w-full ${maxWidth} border border-indigo-500/20 transform animate-scale-in flex flex-col max-h-[95vh]`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center p-5 border-b border-gray-700 flex-shrink-0">
                    <div id="modal-title" className="flex-grow text-xl font-bold text-white">{title}</div>
                    <button 
                        onClick={onClose} 
                        className="text-gray-400 hover:text-white transition-colors ml-4 flex-shrink-0"
                        aria-label="Закрыть модальное окно"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
                {footer !== undefined ? (
                    <>{footer}</>
                ) : (
                    <div className="flex justify-end p-4 bg-gray-900/50 rounded-b-2xl border-t border-gray-700 flex-shrink-0">
                        <button 
                            onClick={onClose} 
                            className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-6 rounded-lg transition duration-200"
                        >
                            Закрыть
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
