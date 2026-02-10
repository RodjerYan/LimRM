
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

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, maxWidth = 'max-w-4xl', zIndex = 'z-[9999]' }) => {
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
            className={`fixed inset-0 ${zIndex} flex justify-center items-center p-4`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            {/* Light Glass Overlay */}
            <div
                className="absolute inset-0 bg-white/60 backdrop-blur-md transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />
            
            {/* Modal Container */}
            <div
                className={[
                    'relative w-full max-h-[95vh] flex flex-col',
                    maxWidth,
                    'rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-xl',
                    'shadow-[0_30px_80px_rgba(15,23,42,0.18)]',
                    'animate-fade-up'
                ].join(' ')}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/70 bg-white/70 rounded-t-3xl flex-shrink-0">
                    <div id="modal-title" className="min-w-0">
                        {typeof title === 'string' ? (
                            <h3 className="t-h2">{title}</h3>
                        ) : (
                            <div className="t-h2">{title}</div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-4 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-900/5 transition flex-shrink-0"
                        aria-label="Закрыть модальное окно"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar bg-transparent">
                    {children}
                </div>

                {/* Footer */}
                {footer !== undefined ? (
                    <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200/70 bg-white/50 rounded-b-3xl">
                        {footer}
                    </div>
                ) : (
                    <div className="flex justify-end gap-2 px-6 py-4 bg-white/50 border-t border-slate-200/70 rounded-b-3xl flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-6 rounded-2xl transition duration-200 shadow-[0_10px_20px_rgba(15,23,42,0.15)] active:scale-95 text-sm"
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
