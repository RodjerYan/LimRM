
import React, { useEffect, useState } from 'react';
import { CheckIcon, DataIcon, TrashIcon } from './icons';

interface MergeOverlayProps {
    isOpen: boolean;
    initialCount: number;
    finalCount: number;
    onComplete: () => void;
    onCancel: () => void;
}

const MergeOverlay: React.FC<MergeOverlayProps> = ({ isOpen, initialCount, finalCount, onComplete, onCancel }) => {
    const [currentCount, setCurrentCount] = useState(initialCount);
    const [phase, setPhase] = useState<'confirm' | 'merging' | 'success'>('confirm');
    const [progress, setProgress] = useState(0);
    const duplicatesCount = initialCount - finalCount;

    useEffect(() => {
        if (isOpen) {
            setPhase('confirm');
            setCurrentCount(initialCount);
            setProgress(0);
        }
    }, [isOpen, initialCount]);

    const startMerge = () => {
        setPhase('merging');
        
        const duration = 2000; // 2 seconds animation
        const startTime = Date.now();
        const startVal = initialCount;
        const endVal = finalCount;

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progressRatio = Math.min(elapsed / duration, 1);
            
            // Ease out quart
            const ease = 1 - Math.pow(1 - progressRatio, 4);
            
            const currentVal = Math.round(startVal - (startVal - endVal) * ease);
            setCurrentCount(currentVal);
            setProgress(progressRatio * 100);

            if (progressRatio < 1) {
                requestAnimationFrame(animate);
            } else {
                setTimeout(() => {
                    setPhase('success');
                    if ((window as any).confetti) {
                        (window as any).confetti({
                            particleCount: 150,
                            spread: 70,
                            origin: { y: 0.6 },
                            colors: ['#6366f1', '#10b981', '#ffffff']
                        });
                    }
                    setTimeout(onComplete, 1500); // Wait a bit before closing
                }, 300);
            }
        };

        requestAnimationFrame(animate);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 backdrop-blur-md animate-fade-in">
            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 shadow-[0_30px_80px_rgba(15,23,42,0.18)] overflow-hidden">
                
                {/* Background Decor (Light) */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-shimmer"></div>
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
                
                {phase === 'confirm' && (
                    <div className="text-center space-y-6 animate-scale-in">
                        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto border border-indigo-100 text-indigo-500">
                            <DataIcon />
                        </div>
                        
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">Оптимизация Базы</h3>
                            <p className="text-slate-500 text-sm">
                                Система проанализировала <strong>{initialCount.toLocaleString()}</strong> записей.
                                <br/>Найдено дубликатов по адресу и каналу:
                            </p>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="text-4xl font-black text-slate-900 font-mono mb-1">
                                {duplicatesCount.toLocaleString()}
                            </div>
                            <div className="text-xs text-rose-500 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                <TrashIcon className="w-3 h-3"/> Лишние записи
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={onCancel}
                                className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-all"
                            >
                                Отмена
                            </button>
                            <button 
                                onClick={startMerge}
                                className="py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/30"
                            >
                                Объединить
                            </button>
                        </div>
                    </div>
                )}

                {phase === 'merging' && (
                    <div className="text-center space-y-8 animate-fade-in">
                        <div className="relative w-32 h-32 mx-auto">
                            {/* Spinning Rings */}
                            <div className="absolute inset-0 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-2 border-4 border-purple-100 border-b-purple-500 rounded-full animate-spin-slow"></div>
                            
                            {/* Center Number */}
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                                    {currentCount.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-indigo-600 animate-pulse">Сжатие данных...</h3>
                            <p className="text-xs text-slate-500 mt-2">Объединение объемов продаж и истории</p>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-100 ease-out"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {phase === 'success' && (
                    <div className="text-center space-y-6 animate-scale-in">
                        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border border-emerald-100 text-emerald-500">
                            <CheckIcon />
                        </div>
                        
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">Готово!</h3>
                            <p className="text-emerald-600 text-sm font-medium">
                                База оптимизирована успешно.
                            </p>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 divide-x divide-slate-200">
                            <div>
                                <div className="text-xs text-slate-400 uppercase">Было</div>
                                <div className="text-lg font-bold text-slate-400 line-through">{initialCount.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs text-emerald-600 uppercase font-bold">Стало</div>
                                <div className="text-xl font-bold text-slate-900">{finalCount.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default MergeOverlay;
