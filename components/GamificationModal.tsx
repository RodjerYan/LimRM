
import React from 'react';
import Modal from './Modal';
import { RMMetrics, SalesLeagueMember } from '../types';
import { TargetIcon } from './icons';

interface GamificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: RMMetrics[];
}

const GamificationModal: React.FC<GamificationModalProps> = ({ isOpen, onClose, data }) => {
    
    // Simulate League Logic based on real data
    const leagueData: SalesLeagueMember[] = data.map((rm, idx) => {
        // Mock achievement logic: 80% to 120%
        const achievement = 80 + Math.random() * 40; 
        let badge: SalesLeagueMember['badge'] = undefined;
        
        if (achievement > 110) badge = 'champion';
        else if (achievement > 100) badge = 'rising_star';
        else if (achievement < 85) badge = 'risk';
        else badge = 'grinder';

        return {
            rank: 0, // Assigned after sort
            name: rm.rmName,
            score: Math.round(achievement * 10), // Points
            achievementPct: achievement,
            volume: rm.totalFact,
            trend: (Math.random() > 0.5 ? 'up' : 'flat') as SalesLeagueMember['trend'],
            badge
        };
    }).sort((a, b) => b.score - a.score).map((item, idx) => ({ ...item, rank: idx + 1 }));

    const getBadgeIcon = (badge?: string) => {
        switch(badge) {
            case 'champion': return <span className="text-xl">👑</span>;
            case 'rising_star': return <span className="text-xl">🚀</span>;
            case 'risk': return <span className="text-xl">⚠️</span>;
            default: return <span className="text-xl">🛡️</span>;
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Лига Чемпионов Limkorm" maxWidth="max-w-4xl">
            <div className="space-y-6">
                <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 p-6 rounded-2xl border border-yellow-500/30 flex items-center justify-between">
                    <div>
                        <h3 className="text-2xl font-bold text-yellow-400">Сезон 2025: Q1</h3>
                        <p className="text-gray-300 text-sm mt-1">Рейтинг строится на основе выполнения Smart Plan и качества дистрибуции.</p>
                    </div>
                    <div className="text-4xl">🏆</div>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900/50">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4">Ранг</th>
                                <th className="px-6 py-4">Менеджер</th>
                                <th className="px-6 py-4 text-center">Статус</th>
                                <th className="px-6 py-4 text-right">Выполнение Плана</th>
                                <th className="px-6 py-4 text-right">Баллы</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {leagueData.map(member => (
                                <tr key={member.name} className="hover:bg-indigo-500/10 transition-colors">
                                    <td className="px-6 py-4 font-bold text-lg text-gray-500">
                                        #{member.rank}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-white text-lg">
                                        {member.name}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {getBadgeIcon(member.badge)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full ${member.achievementPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                    style={{ width: `${Math.min(100, member.achievementPct)}%` }}
                                                ></div>
                                            </div>
                                            <span className={`font-mono font-bold ${member.achievementPct >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {member.achievementPct.toFixed(1)}%
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-white text-xl">
                                        {member.score}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};

export default GamificationModal;
