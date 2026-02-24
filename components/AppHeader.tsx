
import React from 'react';
import { LoaderIcon, CloudDownloadIcon, InfoIcon } from './icons';
import { FileProcessingState, UpdateJobStatus } from '../types';
import { useAuth } from './auth/AuthContext';
import ProfileModal from './auth/ProfileModal';

interface AppHeaderProps {
    dbStatus: 'empty' | 'ready' | 'loading';
    isCloudSaving: boolean;
    processingState: FileProcessingState;
    activeModule: string;
    updateJobStatus: UpdateJobStatus | null;
    onStartDataUpdate: () => void;
    activeClientsCount: number;
    queueLength?: number;
    onOpenAdmin?: () => void;
    isProfileOpen: boolean;
    setIsProfileOpen: (open: boolean) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ 
    dbStatus, 
    isCloudSaving, 
    processingState, 
    activeModule, 
    updateJobStatus, 
    onStartDataUpdate, 
    activeClientsCount,
    queueLength = 0,
    onOpenAdmin,
    isProfileOpen,
    setIsProfileOpen
}) => {
    const { user, logout, totalUsers } = useAuth();

    return (
        <div className="sticky top-0 z-30 px-4 md:px-6 lg:px-8 py-4">
             <header className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 backdrop-blur-xl shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                {/* premium glow */}
                <div
                    className="pointer-events-none absolute inset-0 opacity-70"
                    style={{
                    background:
                        'radial-gradient(900px 520px at 20% 10%, rgba(99,102,241,0.14), transparent 60%),' +
                        'radial-gradient(880px 520px at 72% 18%, rgba(34,211,238,0.12), transparent 60%)',
                    }}
                />

                <div className="relative px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-6 w-full md:w-auto overflow-x-auto">
                        {/* Local DB Status */}
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm ${dbStatus === 'ready' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
                                {dbStatus === 'ready' ? (
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                ) : (
                                    <LoaderIcon className="w-4 h-4 animate-spin" />
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">System</span>
                                <span className="text-sm font-bold text-slate-900">{dbStatus === 'ready' ? 'Online' : 'Syncing...'}</span>
                            </div>
                        </div>

                        {/* Status Chips */}
                        {isCloudSaving && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-200 text-xs font-bold shadow-sm animate-pulse">
                                <LoaderIcon className="w-3 h-3" />
                                <span>Saving...</span>
                            </div>
                        )}
                        
                        {queueLength > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200 text-xs font-bold shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                <span>Queue: {queueLength}</span>
                            </div>
                        )}

                        {!isCloudSaving && processingState.isProcessing && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700 shadow-sm animate-pulse">
                                <LoaderIcon className="w-3 h-3" />
                                <span>{processingState.message} {Math.round(processingState.progress)}%</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 text-right w-full md:w-auto justify-end">
                         {/* User Info Block */}
                         {user && (
                            <div className="flex items-center gap-3 border-r border-slate-200 pr-4 mr-1">
                                <div 
                                    className="text-right hidden sm:block cursor-pointer hover:text-indigo-600 transition-colors group"
                                    onClick={() => setIsProfileOpen(true)}
                                >
                                    <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">{user.lastName} {user.firstName}</div>
                                    <div className="text-[10px] text-slate-500 uppercase">{user.role}</div>
                                </div>
                                <button onClick={logout} className="text-xs text-red-500 font-bold hover:underline">Выйти</button>
                            </div>
                         )}

                        {activeModule === 'amp' && (
                             <button 
                                onClick={onStartDataUpdate}
                                disabled={!!updateJobStatus && updateJobStatus.status !== 'completed' && updateJobStatus.status !== 'error'}
                                className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 transition-all disabled:opacity-50 disabled:cursor-wait shadow-sm hover:shadow-md active:scale-95"
                                title="Запустить фоновый процесс обновления рыночных данных на сервере."
                            >
                                <CloudDownloadIcon className="w-4 h-4" />
                                <span>Обновить рынок</span>
                            </button>
                        )}
                        
                        <div className="h-8 w-px bg-slate-200 hidden md:block"></div>

                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Пользователи</span>
                                <span className="text-slate-900 font-black text-base">{totalUsers}</span>
                            </div>
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center font-black text-white shadow-[0_10px_25px_rgba(99,102,241,0.25)]">
                                L
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <ProfileModal 
                isOpen={isProfileOpen} 
                onClose={() => setIsProfileOpen(false)} 
            />
        </div>
    );
};
