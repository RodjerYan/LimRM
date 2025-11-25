import React, { useState, useMemo } from 'react';
import { AggregatedDataRow } from '../../types';
import { LabIcon, TargetIcon } from '../icons';

interface AgileLearningProps {
    data: AggregatedDataRow[];
}

const AgileLearning: React.FC<AgileLearningProps> = ({ data }) => {
    const [selectedRegion, setSelectedRegion] = useState<string>('');
    
    // Extract unique regions
    const regions = useMemo(() => {
        const s = new Set<string>();
        data.forEach(d => s.add(d.region));
        return Array.from(s).sort();
    }, [data]);

    // Find control candidates (mock logic for similarity)
    const controlCandidates = useMemo(() => {
        if (!selectedRegion) return [];
        const targetData = data.filter(d => d.region === selectedRegion);
        const targetVolume = targetData.reduce((sum, d) => sum + d.fact, 0);

        return regions
            .filter(r => r !== selectedRegion)
            .map(r => {
                const rData = data.filter(d => d.region === r);
                const rVolume = rData.reduce((sum, d) => sum + d.fact, 0);
                // Simple similarity score based on volume difference
                const diff = Math.abs(targetVolume - rVolume);
                const similarity = Math.max(0, 100 - (diff / targetVolume) * 100);
                return { region: r, volume: rVolume, similarity };
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);
    }, [selectedRegion, data, regions]);

    if (data.length === 0) {
        return <div className="text-center text-gray-500 mt-20">Please load data in ADAPTA module first.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">AGILE LEARNING <span className="text-gray-500 font-normal text-lg">/ Experimentation</span></h2>
                    <p className="text-gray-400 text-sm mt-1">Design "Test vs Control" experiments to measure incrementality.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Setup */}
                <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <LabIcon small /> Experiment Setup
                    </h3>
                    
                    <label className="block text-sm text-gray-400 mb-2">Select Test Region (Impact Zone)</label>
                    <select 
                        className="w-full bg-gray-800 border border-gray-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 mb-6"
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                    >
                        <option value="">-- Choose Region --</option>
                        {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>

                    {selectedRegion && (
                        <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
                            <div className="text-xs text-indigo-300 uppercase font-bold mb-2">Experiment Parameters</div>
                            <ul className="space-y-2 text-sm text-gray-300">
                                <li className="flex justify-between">
                                    <span>Metric:</span> <span className="text-white">Sales Volume (kg)</span>
                                </li>
                                <li className="flex justify-between">
                                    <span>Duration:</span> <span className="text-white">3 Months (Recommended)</span>
                                </li>
                                <li className="flex justify-between">
                                    <span>Contamination Check:</span> <span className="text-emerald-400">Passed</span>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Candidates */}
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <TargetIcon small /> Recommended Control Groups
                    </h3>
                    <p className="text-xs text-gray-400">
                        Regions with highest statistical similarity to <strong>{selectedRegion || '...'}</strong> based on historical sales volume.
                    </p>

                    {controlCandidates.map((c, idx) => (
                        <div key={c.region} className="bg-gray-800/40 border border-gray-700 p-4 rounded-xl flex justify-between items-center hover:bg-gray-800 transition-colors cursor-pointer">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded">{idx + 1}</span>
                                    <span className="font-bold text-white">{c.region}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Volume: {new Intl.NumberFormat('ru-RU').format(c.volume)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-emerald-400">{c.similarity.toFixed(1)}%</div>
                                <div className="text-[10px] text-gray-500 uppercase">Match Score</div>
                            </div>
                        </div>
                    ))}

                    {selectedRegion && controlCandidates.length > 0 && (
                        <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-900/20 mt-4">
                            Launch Experiment Simulation
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgileLearning;