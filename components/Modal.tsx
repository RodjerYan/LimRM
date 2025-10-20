import React, { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEsc);

        return () => {
            window.removeEventListener('keydown', handleEsc);
        };
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div 
                className="bg-card-bg/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-7xl border border-border-color transform animate-scale-in flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking inside
            >
                <header className="flex justify-between items-center p-5 border-b border-border-color flex-shrink-0">
                    <h3 id="modal-title" className="text-xl font-bold text-white truncate pr-4">{title}</h3>
                    <button 
                        onClick={onClose} 
                        className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                        aria-label="Закрыть модальное окно"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </header>
                <main className="p-6 overflow-y-auto custom-scrollbar flex-grow">
                    {children}
                </main>
                <footer className="flex justify-end p-4 bg-gray-900/50 rounded-b-2xl border-t border-border-color flex-shrink-0">
                    <button 
                        onClick={onClose} 
                        className="bg-accent hover:bg-accent-hover text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200"
                    >
                        Закрыть
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default Modal;