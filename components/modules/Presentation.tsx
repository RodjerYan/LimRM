
import React, { useState, useMemo } from 'react';
import { Doughnut, Pie } from 'react-chartjs-2';
import { TargetIcon, BrainIcon, TrendingUpIcon, UsersIcon, DataIcon, CheckIcon, WarningIcon } from '../icons';

interface Slide {
    id: string;
    title: string;
    content: React.ReactNode;
}

const Presentation: React.FC = () => {
    const [activeBlock, setActiveBlock] = useState(1);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

    const blocks = [
        { id: 1, title: 'Зоо бизнес' },
        { id: 2, title: 'Компания глазами партнеров' },
        { id: 3, title: 'Роль брендов' },
        { id: 4, title: 'Каналы сбыта' }
    ];

    const slides: Record<number, Slide[]> = {
        1: [
            {
                id: '1-1', title: 'Что такое зообизнес',
                content: (
                    <div className="space-y-6">
                        <p className="text-xl text-gray-300 leading-relaxed">
                            Зообизнес сегодня — это не просто продажа кормов, а сложная экосистема заботы о питомцах, 
                            включающая нутрициологию, ветеринарный контроль и цифровые сервисы.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/20 shadow-xl">
                                <div className="text-indigo-400 mb-4"><UsersIcon /></div>
                                <h4 className="font-bold text-white mb-2">Гуманизация</h4>
                                <p className="text-sm text-gray-400">Питомец — полноправный член семьи. Требования к качеству питания растут.</p>
                            </div>
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/20 shadow-xl">
                                <div className="text-emerald-400 mb-4"><DataIcon /></div>
                                <h4 className="font-bold text-white mb-2">Технологичность</h4>
                                <p className="text-sm text-gray-400">Индивидуальные рационы и смарт-упаковка становятся стандартом.</p>
                            </div>
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/20 shadow-xl">
                                <div className="text-amber-400 mb-4"><TrendingUpIcon /></div>
                                <h4 className="font-bold text-white mb-2">Премиумизация</h4>
                                <p className="text-sm text-gray-400">Смещение спроса в сторону High-Premium и Super-Premium сегментов.</p>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '1-2', title: 'Этапы развития зообизнеса',
                content: (
                    <div className="space-y-12">
                        <div className="relative">
                            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-700 -translate-y-1/2 z-0"></div>
                            <div className="flex justify-between relative z-10">
                                {[
                                    { yr: '1990-2000', t: 'Становление', desc: 'Хаотичный импорт, первые локальные производства.' },
                                    { yr: '2000-2015', t: 'Рост сетей', desc: 'Бум специализированной розницы, доминирование глобальных брендов.' },
                                    { yr: '2015-2024', t: 'Импортозамещение', desc: 'Квантовый скачок качества российских заводов.' },
                                    { yr: '2025+', t: 'Экосистемы', desc: 'Переход к мультисервисным моделям потребления.' }
                                ].map((item, i) => (
                                    <div key={i} className="text-center w-1/4 px-4">
                                        <div className="w-4 h-4 rounded-full bg-indigo-500 mx-auto mb-4 ring-4 ring-gray-900 shadow-[0_0_10px_#6366f1]"></div>
                                        <div className="text-indigo-400 font-bold mb-1">{item.yr}</div>
                                        <div className="text-white font-bold text-sm mb-2">{item.t}</div>
                                        <div className="text-[10px] text-gray-500 leading-tight">{item.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '1-3', title: 'Вектор трансформации (5-10 лет)',
                content: (
                    <div className="bg-indigo-900/10 border border-indigo-500/20 p-8 rounded-3xl">
                        <h4 className="text-indigo-300 font-bold text-lg mb-6 flex items-center gap-2"><BrainIcon /> Прогноз AI-моделирования</h4>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-8 text-gray-300">
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400">01</div>
                                <div><strong className="text-white block mb-1">D2C Модели</strong> Прямая доставка свежего корма по подписке от завода.</div>
                            </li>
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400">02</div>
                                <div><strong className="text-white block mb-1">Functional Food</strong> Корма как профилактика специфических заболеваний по породам.</div>
                            </li>
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400">03</div>
                                <div><strong className="text-white block mb-1">Sustainable</strong> Экологичная упаковка и альтернативные источники белка.</div>
                            </li>
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400">04</div>
                                <div><strong className="text-white block mb-1">Smart Logistics</strong> Использование ИИ для прогнозирования стоков в каждой ТТ.</div>
                            </li>
                        </ul>
                    </div>
                )
            },
            {
                id: '1-5', title: 'Лимкорм Групп в России',
                content: (
                    <div className="flex flex-col md:flex-row gap-10 items-center">
                        <div className="flex-1 space-y-6">
                            <div className="bg-gray-800/40 p-6 rounded-2xl border-l-4 border-indigo-500">
                                <h4 className="text-2xl font-bold text-white mb-2">Производитель №1</h4>
                                <p className="text-gray-400">Лидерство по объему производства сухих кормов в РФ.</p>
                            </div>
                            <div className="bg-gray-800/40 p-6 rounded-2xl border-l-4 border-emerald-500">
                                <h4 className="text-2xl font-bold text-white mb-2">Золотой Стандарт</h4>
                                <p className="text-gray-400">Технологическое превосходство: автоматизация 98% процессов.</p>
                            </div>
                        </div>
                        <div className="w-full md:w-80 h-80 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-full flex items-center justify-center border border-white/10 shadow-2xl relative">
                            <div className="text-center">
                                <div className="text-5xl font-black text-white mb-2">2025</div>
                                <div className="text-xs text-indigo-300 uppercase tracking-widest font-bold">Год лидерства</div>
                            </div>
                            <div className="absolute -top-4 -right-4 bg-indigo-600 p-4 rounded-2xl shadow-xl animate-bounce">
                                <TargetIcon />
                            </div>
                        </div>
                    </div>
                )
            }
        ],
        2: [
            {
                id: '2-1', title: 'Направления деятельности',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { n: 'НТМ (Наш Рацион)', val: '45%', desc: 'Массовый сегмент, база объема.' },
                            { n: 'СТМ (Частные марки)', val: '30%', desc: 'Контрактное производство для сетей.' },
                            { n: 'Рыба (Аквакультура)', val: '25%', desc: 'Высокотехнологичное растущее направление.' }
                        ].map((d, i) => (
                            <div key={i} className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/10 text-center">
                                <div className="text-3xl font-black text-indigo-400 mb-2">{d.val}</div>
                                <div className="text-lg font-bold text-white mb-4">{d.n}</div>
                                <p className="text-xs text-gray-500">{d.desc}</p>
                            </div>
                        ))}
                    </div>
                )
            },
            {
                id: '2-2', title: 'Сравнение с глобальными лидерами (Benchmark)',
                content: (
                    <div className="space-y-6">
                        <p className="text-sm text-gray-400 italic">Сравнительный анализ пути развития (AI Insights: Mars vs Nestle vs Limkorm)</p>
                        <div className="overflow-hidden rounded-2xl border border-gray-700">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-800 text-gray-300 uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Параметр</th>
                                        <th className="px-6 py-4 text-indigo-400">Mars / Nestle</th>
                                        <th className="px-6 py-4 text-emerald-400">Limkorm Group</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800 text-gray-400 bg-gray-900/30">
                                    <tr><td className="px-6 py-4 font-bold text-gray-300">Фокус</td><td className="px-6 py-4">Маркетинг и брендинг</td><td className="px-6 py-4">Технология и сырьевой контроль</td></tr>
                                    <tr><td className="px-6 py-4 font-bold text-gray-300">Скорость R&D</td><td className="px-6 py-4">Медленная (циклы 2-3 года)</td><td className="px-6 py-4">Высокая (запуск SKU за 6 мес)</td></tr>
                                    <tr><td className="px-6 py-4 font-bold text-gray-300">Локализация</td><td className="px-6 py-4">Глобальные стандарты</td><td className="px-6 py-4">Адаптация под российский менталитет</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            },
            {
                id: '2-7', title: 'Вызов 2026: Доверие и Любовь',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                            <h4 className="text-2xl font-bold text-white">Инструменты привития любви к продукту</h4>
                            <ul className="space-y-4">
                                <li className="flex gap-3"><CheckIcon className="text-emerald-500 shrink-0"/> <span className="text-gray-300">Прозрачность производства (Open Factory)</span></li>
                                <li className="flex gap-3"><CheckIcon className="text-emerald-500 shrink-0"/> <span className="text-gray-300">Экспертные сообщества (Клуб заводчиков AJO)</span></li>
                                <li className="flex gap-3"><CheckIcon className="text-emerald-500 shrink-0"/> <span className="text-gray-300">Гарантия вкусовой привлекательности</span></li>
                            </ul>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-600/20 to-pink-600/20 p-8 rounded-3xl border border-white/5 flex items-center justify-center text-center">
                            <div className="space-y-2">
                                <div className="text-6xl mb-4">❤️</div>
                                <div className="text-white font-bold text-xl uppercase tracking-widest">Российский продукт</div>
                                <div className="text-indigo-300 text-sm">Сделано с любовью к своим</div>
                            </div>
                        </div>
                    </div>
                )
            }
        ],
        3: [
            {
                id: '3-1', title: 'Сила бренда и локомотивы',
                content: (
                    <div className="space-y-6">
                        <p className="text-xl text-gray-300">
                            Бренды — это активы. Развитие брендов-локомотивов позволяет компании диктовать условия рынку и 
                            строить долгосрочную лояльность.
                        </p>
                        <div className="flex gap-4 flex-wrap mt-8">
                             {['AJO', 'Sirius', 'Наш Рацион'].map(b => (
                                 <div key={b} className="px-10 py-5 bg-indigo-600/20 rounded-xl border border-indigo-500/50 text-white font-black text-2xl shadow-lg">{b}</div>
                             ))}
                        </div>
                    </div>
                )
            },
            {
                id: '3-3', title: 'Распределение портфеля: Объем vs Деньги',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                        <div className="space-y-4">
                            <div className="h-64 flex flex-col items-center">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">Доля в ОБЪЕМЕ (кг)</h4>
                                <Pie data={{
                                    labels: ['Sirius', 'AJO', 'Наш Рацион', 'Другие'],
                                    datasets: [{ data: [45, 15, 30, 10], backgroundColor: ['#818cf8', '#34d399', '#fbbf24', '#4b5563'], borderWidth: 0 }]
                                }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }} />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="h-64 flex flex-col items-center">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">Доля в ВЫРУЧКЕ (₽)</h4>
                                <Pie data={{
                                    labels: ['Sirius', 'AJO', 'Наш Рацион', 'Другие'],
                                    datasets: [{ data: [35, 40, 15, 10], backgroundColor: ['#818cf8', '#34d399', '#fbbf24', '#4b5563'], borderWidth: 0 }]
                                }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }} />
                            </div>
                        </div>
                        <div className="md:col-span-2 bg-gray-800/50 p-4 rounded-xl border border-amber-500/30 text-center">
                            <p className="text-sm text-amber-400 font-bold">⚠️ ВЫВОД: AJO — основной драйвер доходности, дающий 40% денег при 15% объема.</p>
                        </div>
                    </div>
                )
            },
             {
                id: '3-4', title: 'Стратегия по брендам',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-800/30 rounded-xl border border-white/5">
                            <h5 className="font-bold text-indigo-400 mb-1">AJO & Sirius</h5>
                            <p className="text-xs text-gray-400">Укрепление позиций, воспитание лояльности и "любви" к продукту. Премиальный сервис.</p>
                        </div>
                        <div className="p-4 bg-gray-800/30 rounded-xl border border-white/5">
                            <h5 className="font-bold text-emerald-400 mb-1">Одно Мясо</h5>
                            <p className="text-xs text-gray-400">Завоевание сегмента "Люкс". Перелом менталитета в отношении российских брендов.</p>
                        </div>
                        <div className="p-4 bg-gray-800/30 rounded-xl border border-white/5">
                            <h5 className="font-bold text-amber-400 mb-1">Наш Рацион</h5>
                            <p className="text-xs text-gray-400">Стабильность в "Экономе". Доказательство концепции "Цена-Качество".</p>
                        </div>
                        <div className="p-4 bg-gray-800/30 rounded-xl border border-white/5">
                            <h5 className="font-bold text-rose-400 mb-1">Хаппи Лаппи</h5>
                            <p className="text-xs text-gray-400">Экспансия в FMCG-каналы. Новый охват аудитории.</p>
                        </div>
                    </div>
                )
            }
        ],
        4: [
            {
                id: '4-1', title: 'Каналы сбыта: Классификация',
                content: (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         {['Зоо Сети', 'Зоо Розница', 'Вет. Канал', 'Бридеры', 'Спец. Канал', 'Internet', 'FMCG'].map(c => (
                             <div key={c} className="bg-gray-800/50 p-4 rounded-xl text-center border border-indigo-500/10 hover:border-indigo-500 transition-colors">
                                 <div className="text-white font-bold text-sm">{c}</div>
                             </div>
                         ))}
                    </div>
                )
            },
            {
                id: '4-4', title: 'Инструменты укрепления в оффлайн',
                content: (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h5 className="font-bold text-indigo-400 uppercase text-xs tracking-widest">Оффлайн тактики</h5>
                                <ul className="text-sm text-gray-300 space-y-2">
                                    <li>• Увеличение ассортимента влажных рационов</li>
                                    <li>• Установка фирменного торгового оборудования</li>
                                    <li>• Программы обучения продавцов-консультантов</li>
                                    <li>• Расширение полочного пространства (Eye-level)</li>
                                </ul>
                            </div>
                            <div className="space-y-4">
                                <h5 className="font-bold text-emerald-400 uppercase text-xs tracking-widest">Тренды 2026 (AI Analysis)</h5>
                                <ul className="text-sm text-gray-300 space-y-2">
                                    <li>• Фиджитал-опыт (QR на полке с видео о составе)</li>
                                    <li>• Пробники в ветеринарных клиниках при осмотре</li>
                                    <li>• Сбор обратной связи через чат-ботов на кассе</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )
            }
        ]
    };

    const currentSlide = slides[activeBlock][currentSlideIndex] || slides[activeBlock][0];

    const nextSlide = () => {
        if (currentSlideIndex < slides[activeBlock].length - 1) {
            setCurrentSlideIndex(currentSlideIndex + 1);
        } else if (activeBlock < 4) {
            setActiveBlock(activeBlock + 1);
            setCurrentSlideIndex(0);
        }
    };

    const prevSlide = () => {
        if (currentSlideIndex > 0) {
            setCurrentSlideIndex(currentSlideIndex - 1);
        } else if (activeBlock > 1) {
            setActiveBlock(activeBlock - 1);
            setCurrentSlideIndex(slides[activeBlock - 1].length - 1);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-6 animate-fade-in">
            {/* Block Navigation */}
            <div className="flex bg-gray-900/50 p-1.5 rounded-2xl border border-gray-800 self-start shadow-xl">
                {blocks.map(b => (
                    <button 
                        key={b.id} 
                        onClick={() => { setActiveBlock(b.id); setCurrentSlideIndex(0); }}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeBlock === b.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Блок {b.id}
                    </button>
                ))}
            </div>

            {/* Slide Container */}
            <div className="flex-grow bg-gray-900/30 rounded-3xl border border-indigo-500/10 p-10 flex flex-col relative overflow-hidden backdrop-blur-sm shadow-2xl">
                {/* Background Decor */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>
                
                {/* Slide Title */}
                <div className="mb-10 flex justify-between items-start">
                    <div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                            {blocks.find(b => b.id === activeBlock)?.title}
                        </span>
                        <h2 className="text-4xl font-black text-white mt-4 tracking-tight drop-shadow-md">
                            {currentSlide.title}
                        </h2>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-mono text-gray-600">Slide {currentSlideIndex + 1} / {slides[activeBlock].length}</div>
                    </div>
                </div>

                {/* Slide Content */}
                <div className="flex-grow flex flex-col justify-center max-w-5xl mx-auto w-full">
                    {currentSlide.content}
                </div>

                {/* Bottom Navigation */}
                <div className="mt-auto pt-10 flex justify-between items-center">
                    <button 
                        onClick={prevSlide}
                        disabled={activeBlock === 1 && currentSlideIndex === 0}
                        className="p-4 rounded-full bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all border border-gray-700 shadow-xl active:scale-90"
                    >
                        <svg className="w-6 h-6 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                    
                    <div className="flex gap-2">
                        {slides[activeBlock].map((_, idx) => (
                            <div key={idx} className={`h-1.5 transition-all duration-300 rounded-full ${idx === currentSlideIndex ? 'w-8 bg-indigo-500' : 'w-2 bg-gray-800'}`}></div>
                        ))}
                    </div>

                    <button 
                        onClick={nextSlide}
                        disabled={activeBlock === 4 && currentSlideIndex === slides[4].length - 1}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-10 rounded-2xl flex items-center gap-3 transition-all shadow-lg shadow-indigo-900/40 disabled:opacity-20 active:scale-90"
                    >
                        Далее <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </div>
            
            <div className="text-center text-[10px] text-gray-700 uppercase font-bold tracking-[0.3em]">
                Commercial Insight Presentation • Limkorm Group Strategy 2025-2026
            </div>
        </div>
    );
};

export default Presentation;
