
import React, { Suspense, useEffect, useState } from 'react';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome';
import InteractiveRegionMap from './components/InteractiveRegionMap';
import Filters from './components/Filters';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import { RMDashboard } from './components/RMDashboard';
import Notification from './components/Notification';
import AddressEditModal from './components/AddressEditModal'; 
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import DataUpdateOverlay from './components/DataUpdateOverlay';
import { useAppLogic } from './hooks/useAppLogic';
import { AppHeader } from './components/AppHeader';
import { RoleProvider } from './components/auth/RoleProvider';

// Auth Components
import { AuthProvider, useAuth } from './components/auth/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { AdminUsersModal } from './components/auth/AdminUsersModal';

// Enhanced UX imports
import GlobalSearch from './components/GlobalSearch';
import { useSearchEverywhereItems } from './components/search/useSearchEverywhereItems';

const DetailsModal = React.lazy(() => import('./components/DetailsModal'));
const UnidentifiedRowsModal = React.lazy(() => import('./components/UnidentifiedRowsModal'));

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== '';

const AppContent: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const { user, isLoading: authLoading } = useAuth();
    const [showAdminModal, setShowAdminModal] = useState(false);

    // Block access if not logged in
    if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-slate-400">Загрузка профиля...</div>;
    if (!user) return <AuthModal />;

    const {
        activeModule, setActiveModule,
        allData,
        isCloudSaving,
        updateJobStatus,
        filterStartDate, setFilterStartDate,
        filterEndDate, setFilterEndDate,
        notifications,
        dbStatus,
        okbData, setOkbData,
        okbStatus, setOkbStatus,
        okbRegionCounts,
        unidentifiedRows,
        filters, setFilters,
        processingState, setProcessingState,
        selectedDetailsRow, setSelectedDetailsRow,
        isUnidentifiedModalOpen, setIsUnidentifiedModalOpen,
        editingClient, setEditingClient,
        filtered,
        allActiveClients,
        mapPotentialClients,
        filterOptions,
        summaryMetrics,
        handleStartDataUpdate,
        handleForceUpdate,
        handleDataUpdate,
        handleDeleteClient,
        handleStartPolling,
        queueLength, 
        loadStartDate, setLoadStartDate,
        loadEndDate, setLoadEndDate
    } = useAppLogic();

    // -- Global Search Logic --
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [openChannelRequest, setOpenChannelRequest] = useState<string | null>(null);

    const handleLoadStartDateChange = (date: string) => {
        setLoadStartDate(date);
        if (!date) setFilterStartDate('');
        else setFilterStartDate(date);
    };

    const handleLoadEndDateChange = (date: string) => {
        setLoadEndDate(date);
        if (!date) setFilterEndDate('');
        else setFilterEndDate(date);
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const module = params.get("module");
        const channel = params.get("channel");

        if (module && ['adapta', 'amp', 'dashboard', 'prophet', 'agile', 'roi-genome'].includes(module)) {
            setActiveModule(module);
        }

        if (channel) {
            setActiveModule("adapta");
            setOpenChannelRequest(channel);
        }
    }, [setActiveModule]);

    const searchItems = useSearchEverywhereItems({
        activeTab: activeModule,
        onTabChange: setActiveModule,
        uploadedData: filtered,
        okbData: okbData,
        onStartEdit: (client) => {
            setActiveModule('amp');
            setEditingClient(client);
        },
        openChannel: (ch) => {
            setActiveModule('adapta');
            setOpenChannelRequest(ch);
            const p = new URLSearchParams(window.location.search);
            p.set("module", "adapta");
            p.set("channel", ch);
            window.history.replaceState({}, "", `?${p.toString()}`);
        },
    });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setIsSearchOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        const pingServer = () => {
            fetch('/api/keep-alive', { method: 'GET', cache: 'no-store' })
                .then(res => {
                    if (res.ok) console.debug('💓 [Keep-Alive] Server pinged successfully.');
                })
                .catch(e => console.error('💓 [Keep-Alive] Ping failed:', e));
        };
        pingServer();
        const intervalId = setInterval(pingServer, 300000); 
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="app-premium-bg">
            <div className="relative flex">
                <Navigation activeTab={activeModule} onTabChange={setActiveModule} />
                
                <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                    <AppHeader 
                        dbStatus={dbStatus}
                        isCloudSaving={isCloudSaving}
                        processingState={processingState}
                        activeModule={activeModule}
                        updateJobStatus={updateJobStatus}
                        onStartDataUpdate={handleStartDataUpdate}
                        activeClientsCount={allActiveClients.length}
                        queueLength={queueLength}
                        onOpenAdmin={() => setShowAdminModal(true)} 
                    />

                    {/* Admin Access Button Floating (Optional fallback if header button fails) */}
                    {user.role === 'admin' && (
                        <div className="absolute top-20 right-8 z-40">
                             <button onClick={() => setShowAdminModal(true)} className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded-lg shadow hover:bg-purple-500">
                                 Администрирование пользователей
                             </button>
                        </div>
                    )}

                    <div className="mx-auto w-full max-w-[1320px] px-4 md:px-6 lg:px-8 py-6">
                        {activeModule === 'adapta' && (
                            <Adapta 
                                processingState={processingState}
                                onForceUpdate={handleForceUpdate}
                                onFileProcessed={() => {}}
                                onProcessingStateChange={() => {}}
                                okbData={okbData}
                                okbStatus={okbStatus}
                                onOkbStatusChange={setOkbStatus}
                                onOkbDataChange={setOkbData}
                                disabled={processingState.isProcessing}
                                unidentifiedCount={unidentifiedRows.length}
                                onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)}
                                activeClientsCount={allActiveClients.length}
                                uploadedData={allData} 
                                dbStatus={dbStatus}
                                onStartEdit={setEditingClient}
                                startDate={filterStartDate} 
                                endDate={filterEndDate}     
                                onStartDateChange={setFilterStartDate} 
                                onEndDateChange={setFilterEndDate}
                                loadStartDate={loadStartDate}
                                loadEndDate={loadEndDate}
                                onLoadStartDateChange={handleLoadStartDateChange}
                                onLoadEndDateChange={handleLoadEndDateChange}
                                openChannelRequest={openChannelRequest}
                                onConsumeOpenChannelRequest={() => setOpenChannelRequest(null)}
                                onTabChange={setActiveModule}
                                setIsSearchOpen={setIsSearchOpen}
                                selectedRm={filters.rm}
                                onRmChange={(rm) => setFilters(prev => ({ ...prev, rm }))}
                            />
                        )}

                        {activeModule === 'amp' && (
                            <div className="space-y-6">
                                <InteractiveRegionMap data={filtered} activeClients={allActiveClients} potentialClients={mapPotentialClients} onEditClient={setEditingClient} selectedRegions={filters.region} flyToClientKey={null} />
                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                    <div className="lg:col-span-1">
                                        <Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({rm:'', brand:[], packaging:[], region:[]})} disabled={allData.length === 0} />
                                    </div>
                                    <div className="lg:col-span-3"><PotentialChart data={filtered} /></div>
                                </div>
                                <ResultsTable 
                                    data={filtered} 
                                    onRowClick={setSelectedDetailsRow} 
                                    unidentifiedRowsCount={unidentifiedRows.length} 
                                    onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} 
                                    disabled={allData.length === 0} 
                                />
                            </div>
                        )}

                        {activeModule === 'dashboard' && (
                            <RMDashboard 
                                isOpen={true} 
                                onClose={() => setActiveModule('amp')} 
                                data={filtered} 
                                metrics={summaryMetrics} 
                                okbRegionCounts={okbRegionCounts} 
                                mode="page" 
                                okbData={okbData} 
                                okbStatus={okbStatus} 
                                onEditClient={setEditingClient} 
                                startDate={filterStartDate}
                                endDate={filterEndDate}
                            />
                        )}

                        {activeModule === 'prophet' && <Prophet data={filtered} />}
                        {activeModule === 'agile' && <AgileLearning data={filtered} />}
                        {activeModule === 'roi-genome' && <RoiGenome data={filtered} />}
                    </div>
                </main>

                <DataUpdateOverlay jobStatus={updateJobStatus} />

                <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">
                    {notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}
                </div>

                <Suspense fallback={null}>
                    {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
                    {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
                </Suspense>
                
                {editingClient && (
                    <AddressEditModal 
                        isOpen={!!editingClient} 
                        onClose={() => setEditingClient(null)} 
                        onBack={() => setEditingClient(null)} 
                        data={editingClient} 
                        onDataUpdate={handleDataUpdate}
                        onStartPolling={handleStartPolling} 
                        onDelete={handleDeleteClient}
                        globalTheme="light" 
                    />
                )}
                
                <GlobalSearch 
                    isOpen={isSearchOpen} 
                    onClose={() => setIsSearchOpen(false)} 
                    items={searchItems} 
                />

                <AdminUsersModal isOpen={showAdminModal} onClose={() => setShowAdminModal(false)} />
            </div>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <RoleProvider initialRole="manager">
                <AppContent />
            </RoleProvider>
        </AuthProvider>
    );
};

export default App;
