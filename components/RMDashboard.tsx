
// ... existing code ...
    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Детализация ${regionName}: ${brandMetric.name}`} 
            maxWidth="max-w-[75vw]" 
        >
            <div className="space-y-4">
                {/* Stats Header */}
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex justify-between items-center text-sm shadow-sm backdrop-blur-sm">
                    <div className="flex gap-8 items-center">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Фасовок</span>
                            <span className="text-white font-bold text-lg">{aggregatedRows.length}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-700"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий Факт</span>
                            <span className="text-emerald-400 font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalFact)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Общий План</span>
                            <span className="text-white font-mono font-bold text-lg">{new Intl.NumberFormat('ru-RU').format(totalPlan)}</span>
                        </div>
                    </div>
                    <button 
                        onClick={handleExportXLSX}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded-lg transition-all border border-emerald-500/50 shadow-lg hover:shadow-emerald-500/20"
                    >
                        <ExportIcon />
                        Выгрузить в XLSX
                    </button>
                </div>
                
                {/* Main Data Table */}
                <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900/40 shadow-inner">
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full text-sm text-left table-fixed">
                            <thead className="bg-gray-800/90 text-gray-400 font-semibold text-xs uppercase tracking-wider sticky top-0 z-20 backdrop-blur-md shadow-sm">
                                <tr>
                                    {/* Fixed narrow width for Packaging */}
                                    <th className="px-6 py-4 w-40 text-gray-300">Фасовка</th>
                                    
                                    {/* Flexible width for SKU */}
                                    <th className="px-6 py-4 w-auto">SKU (Ассортимент)</th>

                                    {/* New Column: Channel */}
                                    <th className="px-6 py-4 w-48 text-gray-300">Канал</th>
                                    
                                    {/* Fixed widths for metrics */}
                                    <th className="px-6 py-4 w-32 text-right">Инд. Рост</th>
                                    <th className="px-6 py-4 w-32 text-right">Факт</th>
                                    <th className="px-6 py-4 w-32 text-right">План 2026</th>
                                    
                                    {/* Action button */}
                                    <th className="px-6 py-4 w-24 text-center">Анализ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-gray-300">
                                {aggregatedRows.map((row) => {
                                    const growthPct = row.growthPct;
                                    return (
                                        <tr key={row.key} className="hover:bg-gray-800/60 transition-colors group align-top">
                                            <td className="px-6 py-4 font-bold text-white whitespace-nowrap bg-gray-900/30">
                                                {row.packaging}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                                    {row.skuList.length > 0 ? (
                                                        <ul className="text-xs text-gray-400 space-y-1.5">
                                                            {row.skuList.map((sku, idx) => (
                                                                <li key={idx} className="leading-relaxed flex items-start gap-2">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 flex-shrink-0 group-hover:bg-indigo-500 transition-colors"></span>
                                                                    <span className="group-hover:text-gray-200 transition-colors">{sku}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-xs text-gray-600 italic">Не указано</span>
                                                    )}
                                                </div>
                                            </td>
                                            {/* Channel Data */}
                                            <td className="px-6 py-4 text-xs text-indigo-300 font-medium align-middle">
                                                {row.channelList.length > 0 ? (
                                                    <div className="flex flex-col space-y-1">
                                                        {row.channelList.map((ch, idx) => (
                                                            <span key={idx} className="block border-b border-indigo-500/10 last:border-0 pb-0.5 last:pb-0">
                                                                {ch}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono whitespace-nowrap">
                                                {row.planMetric ? (
                                                    <button
                                                        onClick={() => onExplain(row.planMetric!)}
                                                        className={`font-bold py-1 px-2 rounded hover:bg-gray-700 transition-colors ${growthPct > 0 ? 'text-emerald-400' : 'text-amber-400'}`}
                                                        title="Нажмите для обоснования процента роста"
                                                    >
                                                        {growthPct > 0 ? '+' : ''}{growthPct.toFixed(1)}%
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-gray-300 whitespace-nowrap">
                                                {new Intl.NumberFormat('ru-RU').format(row.fact)}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-white font-bold whitespace-nowrap bg-gray-800/10">
                                                {new Intl.NumberFormat('ru-RU').format(row.plan)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => onAnalyze(row)}
                                                    className="p-2 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition-all border border-indigo-500/20 hover:border-indigo-500 shadow-sm hover:shadow-indigo-500/40 active:scale-95"
                                                    title="Получить анализ от Джемини для этой фасовки"
                                                >
                                                    <BrainIcon small />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
// ... existing code ...
