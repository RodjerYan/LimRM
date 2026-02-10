import React, { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
    zIndex?: string; // stacking control
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, maxWidth = 'max-w-7xl', zIndex = 'z-[9999]' }) => {
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div
            className={`fixed inset-0 ${zIndex} flex justify-center items-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in`}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div
                className={`w-full ${maxWidth} max-h-[95vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-gray-200 transform animate-scale-in flex flex-col`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 p-5 border-b border-gray-200 flex-shrink-0 bg-white/80 backdrop-blur">
                    <div id="modal-title" className="flex-grow text-xl font-extrabold text-gray-900 tracking-tight">
                        {title}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-900 transition-colors ml-4 flex-shrink-0 rounded-lg p-2 hover:bg-gray-100"
                        aria-label="Закрыть модальное окно"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar bg-white">
                    {children}
                </div>

                {footer !== undefined ? (
                    <>{footer}</>
                ) : (
                    <div className="flex justify-end gap-2 p-4 bg-gray-50 rounded-b-3xl border-t border-gray-200 flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="bg-indigo-600 hover:bg-indigo-500 text-gray-900 font-bold py-2 px-6 rounded-xl transition duration-200 shadow-sm hover:shadow"
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
