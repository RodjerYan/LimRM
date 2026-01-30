
import React, { useState } from 'react';
import { Doughnut, Pie } from 'react-chartjs-2';
import { TargetIcon, BrainIcon, TrendingUpIcon, UsersIcon, DataIcon, CheckIcon, WarningIcon, ChartBarIcon } from '../icons';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';

// Required registration for Chart.js
ChartJS.register(ArcElement, Tooltip, Legend);

interface Slide {
    id: string;
    title: string;
    content: React.ReactNode;
}

const Presentation: React.FC = () => {
    const [activeBlock, setActiveBlock] = useState(1);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

    const blocks = [
        { id: 1, title: 'Блок 1. Зоо бизнес' },
        { id: 2, title: 'Блок 2. Компания и Партнеры' },
        { id: 3, title: 'Блок 3. Роль Брендов' },
        { id: 4, title: 'Блок 4. Каналы сбыта' }
    ];

    const slides: Record<number, Slide[]> = {
        1: [
            {
                id: '1-1', title: 'Что такое зообизнес',
                content: (
                    <div className="flex flex-col items-center justify-center h-full space-y-8">
                        <div className="text-2xl text-center font-light text-gray-300 max-w-4xl leading-relaxed">
                            <span className="text-indigo-400 font-bold">Зообизнес</span> — это глобальная экосистема заботы о питомцах, охватывающая производство питания, ветеринарию, сервис и эмоциональную связь владельца с животным.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-8">
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/20 flex flex-col items-center text-center">
                                <div className="p-4 bg-indigo-500/20 rounded-full text-indigo-400 mb-4"><UsersIcon /></div>
                                <h4 className="font-bold text-white mb-2">Гуманизация</h4>
                                <p className="text-xs text-gray-400">Питомец — полноправный член семьи. Переход от "кормления" к "питанию".</p>
                            </div>
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-emerald-500/20 flex flex-col items-center text-center">
                                <div className="p-4 bg-emerald-500/20 rounded-full text-emerald-400 mb-4"><DataIcon /></div>
                                <h4 className="font-bold text-white mb-2">Технологии</h4>
                                <p className="text-xs text-gray-400">Научный подход к рецептурам (Functional Food) и цифровизация продаж.</p>
                            </div>
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-amber-500/20 flex flex-col items-center text-center">
                                <div className="p-4 bg-amber-500/20 rounded-full text-amber-400 mb-4"><TrendingUpIcon /></div>
                                <h4 className="font-bold text-white mb-2">Устойчивость</h4>
                                <p className="text-xs text-gray-400">Отрасль показывает рост даже в периоды турбулентности. "Эффект губной помады".</p>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '1-2', title: 'Этапы развития зообизнеса',
                content: (
                    <div className="relative h-full flex flex-col justify-center">
                        <div className="absolute left-10 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 via-purple-500 to-gray-700"></div>
                        <div className="space-y-12 ml-20">
                            <div className="relative">
                                <div className="absolute -left-[52px] top-1 w-6 h-6 rounded-full bg-indigo-500 border-4 border-gray-900 shadow-[0_0_15px_#6366f1]"></div>
                                <h4 className="text-xl font-bold text-white">1.0 Стихийный рынок (90-е - 00-е)</h4>
                                <p className="text-sm text-gray-400 mt-1">Доминирование импорта ("Ножки Буша", Mars/Nestle). Рынки, ларьки. Корм как лакомство.</p>
                            </div>
                            <div className="relative">
                                <div className="absolute -left-[52px] top-1 w-6 h-6 rounded-full bg-purple-500 border-4 border-gray-900"></div>
                                <h4 className="text-xl font-bold text-white">2.0 Становление Сетей (2010-2020)</h4>
                                <p className="text-sm text-gray-400 mt-1">Появление спец. розницы (Четыре Лапы, Бетховен). Рост культуры потребления сухих кормов.</p>
                            </div>
                            <div className="relative">
                                <div className="absolute -left-[52px] top-1 w-6 h-6 rounded-full bg-emerald-500 border-4 border-gray-900 animate-pulse"></div>
                                <h4 className="text-xl font-bold text-white">3.0 Экосистемы и E-com (2020-2025)</h4>
                                <p className="text-sm text-gray-400 mt-1">Взрывной рост маркетплейсов. Импортозамещение. Лимкорм Групп как лидер производства.</p>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '1-3', title: 'Зообизнес через 5-10 лет',
                content: (
                    <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 p-8 rounded-3xl border border-indigo-500/30 h-full flex flex-col justify-center">
                        <h4 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
                            <BrainIcon /> Вектор трансформации
                        </h4>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <div className="text-indigo-400 font-mono text-4xl font-bold">01</div>
                                <h5 className="text-white font-bold text-lg">Гипер-персонализация</h5>
                                <p className="text-sm text-gray-400">Корма по ДНК-тесту. AI-диетологи в смартфоне владельца.</p>
                            </div>
                            <div className="space-y-2">
                                <div className="text-emerald-400 font-mono text-4xl font-bold">02</div>
                                <h5 className="text-white font-bold text-lg">Biotech & Foodtech</h5>
                                <p className="text-sm text-gray-400">Альтернативные протеины (насекомые, растительное мясо). Функциональные добавки.</p>
                            </div>
                            <div className="space-y-2">
                                <div className="text-amber-400 font-mono text-4xl font-bold">03</div>
                                <h5 className="text-white font-bold text-lg">Preventive Health</h5>
                                <p className="text-sm text-gray-400">Стирание грани между ветеринарией и питанием. Корм как профилактика.</p>
                            </div>
                            <div className="space-y-2">
                                <div className="text-rose-400 font-mono text-4xl font-bold">04</div>
                                <h5 className="text-white font-bold text-lg">ESG и Экология</h5>
                                <p className="text-sm text-gray-400">Полностью перерабатываемая упаковка. Углеродный след.</p>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '1-4', title: 'Основные тренды',
                content: (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-full content-center">
                        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 text-center hover:scale-105 transition-transform">
                            <div className="text-4xl mb-4">🌿</div>
                            <h5 className="font-bold text-white">Натуральность</h5>
                            <p className="text-xs text-gray-400 mt-2">Clean Label. Понятный состав.</p>
                        </div>
                        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 text-center hover:scale-105 transition-transform">
                            <div className="text-4xl mb-4">🇷🇺</div>
                            <h5 className="font-bold text-white">Локализация</h5>
                            <p className="text-xs text-gray-400 mt-2">Доверие к бренду "Сделано в России".</p>
                        </div>
                        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 text-center hover:scale-105 transition-transform">
                            <div className="text-4xl mb-4">📱</div>
                            <h5 className="font-bold text-white">Диджитал</h5>
                            <p className="text-xs text-gray-400 mt-2">Влияние отзывов и соцсетей.</p>
                        </div>
                        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 text-center hover:scale-105 transition-transform">
                            <div className="text-4xl mb-4">⚖️</div>
                            <h5 className="font-bold text-white">Рациональность</h5>
                            <p className="text-xs text-gray-400 mt-2">Баланс цены и качества.</p>
                        </div>
                    </div>
                )
            },
            {
                id: '1-5', title: 'Лимкорм Групп в зообизнесе России',
                content: (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                        <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(79,70,229,0.4)]">
                            <span className="text-4xl font-black text-white">№1</span>
                        </div>
                        <h2 className="text-3xl font-bold text-white">Лидер Индустрии</h2>
                        <p className="text-gray-300 max-w-2xl text-lg">
                            Компания <span className="text-indigo-400 font-bold">Лимкорм Групп</span> — драйвер развития российского рынка PetFood. Мы не просто производим корм, мы формируем стандарты качества для всей страны.
                        </p>
                        <div className="flex gap-8 mt-8">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">10 лет</div>
                                <div className="text-xs text-gray-500 uppercase">Опыта и Роста</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">Full Cycle</div>
                                <div className="text-xs text-gray-500 uppercase">Производство</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">R&D</div>
                                <div className="text-xs text-gray-500 uppercase">Собственная лаборатория</div>
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
                    <div className="flex flex-col h-full justify-center space-y-8">
                        <h3 className="text-center text-gray-400 mb-4 uppercase text-sm tracking-widest">Структура бизнеса (Выручка и Объем)</h3>
                        <div className="grid grid-cols-3 gap-6">
                            <div className="relative group cursor-default">
                                <div className="absolute inset-0 bg-indigo-500 blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <div className="relative bg-gray-900 border border-indigo-500/50 p-6 rounded-2xl text-center h-full flex flex-col justify-center">
                                    <div className="text-5xl font-black text-indigo-400 mb-2">НТМ</div>
                                    <div className="text-white font-bold">Наши Торговые Марки</div>
                                    <div className="text-xs text-gray-500 mt-2">Локомотивы (AJO, Sirius)</div>
                                </div>
                            </div>
                            <div className="relative group cursor-default">
                                <div className="absolute inset-0 bg-emerald-500 blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <div className="relative bg-gray-900 border border-emerald-500/50 p-6 rounded-2xl text-center h-full flex flex-col justify-center">
                                    <div className="text-5xl font-black text-emerald-400 mb-2">СТМ</div>
                                    <div className="text-white font-bold">Контрактное производство</div>
                                    <div className="text-xs text-gray-500 mt-2">Партнерство с сетями</div>
                                </div>
                            </div>
                            <div className="relative group cursor-default">
                                <div className="absolute inset-0 bg-cyan-500 blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <div className="relative bg-gray-900 border border-cyan-500/50 p-6 rounded-2xl text-center h-full flex flex-col justify-center">
                                    <div className="text-5xl font-black text-cyan-400 mb-2">Fish</div>
                                    <div className="text-white font-bold">Аквакультура</div>
                                    <div className="text-xs text-gray-500 mt-2">Высокотехнологичный рост</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '2-2', title: 'Этапы развития: Лимкорм vs Запад',
                content: (
                    <div className="grid grid-cols-2 gap-8 h-full items-center">
                        <div className="bg-gray-800/40 p-6 rounded-2xl border-l-4 border-indigo-500 h-full">
                            <h4 className="text-2xl font-bold text-indigo-400 mb-6">LIMKORM GROUP</h4>
                            <ul className="space-y-4 text-gray-300">
                                <li className="flex gap-3"><span className="text-indigo-500 font-bold">🚀</span> <span><strong>Квантовый скачок:</strong> Прошли путь за 10 лет, на который у других ушли десятилетия.</span></li>
                                <li className="flex gap-3"><span className="text-indigo-500 font-bold">⚡</span> <span><strong>Гибкость (Agile):</strong> Мгновенная реакция на тренды и запросы рынка.</span></li>
                                <li className="flex gap-3"><span className="text-indigo-500 font-bold">🎯</span> <span><strong>Локализация:</strong> Понимание российского менталитета "здесь и сейчас".</span></li>
                            </ul>
                        </div>
                        <div className="bg-gray-800/40 p-6 rounded-2xl border-l-4 border-gray-500 h-full opacity-70">
                            <h4 className="text-2xl font-bold text-gray-400 mb-6">WEST (Mars, Nestle)</h4>
                            <ul className="space-y-4 text-gray-400">
                                <li className="flex gap-3"><span>🐢</span> <span><strong>Инерция:</strong> Долгая история (100+ лет), но медленная адаптация.</span></li>
                                <li className="flex gap-3"><span>📜</span> <span><strong>Бюрократия:</strong> Глобальные согласования, унификация продуктов.</span></li>
                                <li className="flex gap-3"><span>🌍</span> <span><strong>Отстраненность:</strong> Фокус на глобальных KPI, а не на локальном потребителе.</span></li>
                            </ul>
                        </div>
                    </div>
                )
            },
            {
                id: '2-3', title: 'Экосистема глазами компании',
                content: (
                    <div className="relative flex items-center justify-center h-full">
                        <div className="absolute w-[500px] h-[500px] bg-indigo-500/5 rounded-full animate-pulse"></div>
                        <div className="relative z-10 grid grid-cols-2 gap-16 text-center">
                            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700 w-48">
                                <div className="text-3xl mb-2">🏭</div>
                                <div className="font-bold text-white">Производство</div>
                            </div>
                            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700 w-48">
                                <div className="text-3xl mb-2">🚚</div>
                                <div className="font-bold text-white">Логистика</div>
                            </div>
                            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700 w-48">
                                <div className="text-3xl mb-2">🤝</div>
                                <div className="font-bold text-white">Партнеры</div>
                            </div>
                            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700 w-48">
                                <div className="text-3xl mb-2">❤️</div>
                                <div className="font-bold text-white">Клиент</div>
                            </div>
                            
                            {/* Center Logo */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-black w-32 h-32 rounded-full flex items-center justify-center font-black text-xl shadow-[0_0_30px_rgba(255,255,255,0.3)] z-20">
                                LIMKORM
                            </div>
                        </div>
                        
                        {/* Connecting Lines (SVG) */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-gray-600" style={{zIndex: 0}}>
                            <line x1="50%" y1="50%" x2="35%" y2="35%" strokeWidth="2" />
                            <line x1="50%" y1="50%" x2="65%" y2="35%" strokeWidth="2" />
                            <line x1="50%" y1="50%" x2="35%" y2="65%" strokeWidth="2" />
                            <line x1="50%" y1="50%" x2="65%" y2="65%" strokeWidth="2" />
                        </svg>
                    </div>
                )
            },
            {
                id: '2-4', title: 'Современный сервис',
                content: (
                    <div className="space-y-6">
                        <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl border-l-4 border-amber-400">
                            <h4 className="text-xl font-bold text-white mb-2">Что такое сервис сегодня?</h4>
                            <p className="text-gray-300">Это не просто "отгрузка товара". Это совокупность эмоций, скорости, удобства и экспертизы, которые мы даем партнеру и конечному покупателю.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="text-center p-4">
                                <div className="text-emerald-400 text-4xl mb-2">⚡</div>
                                <h5 className="font-bold text-white">Скорость</h5>
                                <p className="text-xs text-gray-500">Last Mile Delivery</p>
                            </div>
                            <div className="text-center p-4">
                                <div className="text-indigo-400 text-4xl mb-2">🧠</div>
                                <h5 className="font-bold text-white">Экспертиза</h5>
                                <p className="text-xs text-gray-500">Обучение и консалтинг</p>
                            </div>
                            <div className="text-center p-4">
                                <div className="text-rose-400 text-4xl mb-2">❤️</div>
                                <h5 className="font-bold text-white">Эмпатия</h5>
                                <p className="text-xs text-gray-500">Персональный подход</p>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '2-5', title: 'Как стать ближе к покупателю?',
                content: (
                    <div className="grid grid-cols-2 gap-8 h-full items-center">
                        <div className="bg-gray-800/30 p-8 rounded-full aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-600 relative">
                            <div className="absolute inset-0 rounded-full animate-spin-slow border-t-2 border-indigo-500"></div>
                            <h4 className="text-2xl font-bold text-white">Покупатель</h4>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-gray-900 p-4 rounded-xl border border-gray-700">
                                <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center text-white">1</div>
                                <div><div className="font-bold text-white">Омниканальность</div><div className="text-xs text-gray-400">Быть там, где удобно клиенту (Offline + Online)</div></div>
                            </div>
                            <div className="flex items-center gap-4 bg-gray-900 p-4 rounded-xl border border-gray-700">
                                <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center text-white">2</div>
                                <div><div className="font-bold text-white">Цифровой след</div><div className="text-xs text-gray-400">QR-коды, мобильные приложения, контент.</div></div>
                            </div>
                            <div className="flex items-center gap-4 bg-gray-900 p-4 rounded-xl border border-gray-700">
                                <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center text-white">3</div>
                                <div><div className="font-bold text-white">Обратная связь</div><div className="text-xs text-gray-400">Работа с отзывами, горячая линия 24/7.</div></div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '2-6', title: 'Вызов 2026: Эталон Сервиса',
                content: (
                    <div className="space-y-6 text-center">
                        <h3 className="text-2xl font-bold text-white uppercase tracking-wider">Построение Service 2.0</h3>
                        <div className="flex justify-center items-center gap-2">
                            <div className="bg-gray-800 px-6 py-3 rounded-l-xl border-r border-gray-700">Аудит процессов</div>
                            <div className="text-gray-500">→</div>
                            <div className="bg-gray-800 px-6 py-3">Стандартизация</div>
                            <div className="text-gray-500">→</div>
                            <div className="bg-gray-800 px-6 py-3 border-l border-gray-700">Автоматизация</div>
                            <div className="text-gray-500">→</div>
                            <div className="bg-indigo-600 text-white font-bold px-6 py-3 rounded-r-xl shadow-lg shadow-indigo-500/30">Счастье Клиента</div>
                        </div>
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-white/10 mt-8 max-w-2xl mx-auto">
                            <p className="text-gray-300 italic">"В 2026 году мы не просто продаем корм. Мы продаем решение проблем и уверенность в здоровье питомца."</p>
                        </div>
                    </div>
                )
            },
            {
                id: '2-7', title: 'Любовь к Российскому продукту',
                content: (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="relative w-48 h-48 bg-red-500/10 rounded-full flex items-center justify-center mb-8 animate-pulse border border-red-500/30">
                            <span className="text-6xl">❤️</span>
                        </div>
                        <h3 className="text-3xl font-black text-white mb-4">LOVE BRAND</h3>
                        <div className="grid grid-cols-2 gap-8 text-left max-w-3xl">
                            <div>
                                <h5 className="font-bold text-white mb-1">Доверие</h5>
                                <p className="text-sm text-gray-400">Через открытость (экскурсии на завод) и честный состав.</p>
                            </div>
                            <div>
                                <h5 className="font-bold text-white mb-1">Гордость</h5>
                                <p className="text-sm text-gray-400">Сломать стереотип "импортное лучше". Российское = Качественное.</p>
                            </div>
                        </div>
                    </div>
                )
            }
        ],
        3: [
            {
                id: '3-1', title: 'Бренд: Ценность и Сила',
                content: (
                    <div className="flex flex-col justify-center h-full space-y-8">
                        <div className="text-xl text-center text-gray-300">
                            Бренды-локомотивы — это фундамент финансовой устойчивости компании. Они генерируют трафик, объем и прибыль.
                        </div>
                        <div className="grid grid-cols-3 gap-6 text-center">
                            <div className="p-6 border border-gray-700 rounded-2xl">
                                <div className="text-indigo-400 text-3xl font-bold mb-2">Актив</div>
                                <div className="text-xs text-gray-500">Капитализация компании</div>
                            </div>
                            <div className="p-6 border border-gray-700 rounded-2xl">
                                <div className="text-emerald-400 text-3xl font-bold mb-2">Защита</div>
                                <div className="text-xs text-gray-500">Лояльность при колебаниях цен</div>
                            </div>
                            <div className="p-6 border border-gray-700 rounded-2xl">
                                <div className="text-amber-400 text-3xl font-bold mb-2">Рост</div>
                                <div className="text-xs text-gray-500">Платформа для новинок</div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '3-2', title: 'Портфель Брендов',
                content: (
                    <div className="grid grid-cols-1 gap-6 overflow-y-auto max-h-[400px] p-2">
                        <div className="bg-gradient-to-r from-gray-800 to-purple-900/40 p-6 rounded-2xl border-l-4 border-purple-500 flex items-center justify-between">
                            <div>
                                <h4 className="text-xl font-bold text-white">Одно Мясо</h4>
                                <p className="text-xs text-purple-300">Супер-Премиум / Холистик</p>
                            </div>
                            <div className="text-2xl font-black text-gray-600">LUX</div>
                        </div>
                        <div className="bg-gradient-to-r from-gray-800 to-indigo-900/40 p-6 rounded-2xl border-l-4 border-indigo-500 flex items-center justify-between">
                            <div>
                                <h4 className="text-xl font-bold text-white">AJO</h4>
                                <p className="text-xs text-indigo-300">Супер-Премиум. Флагман маржинальности.</p>
                            </div>
                            <div className="text-2xl font-black text-gray-600">HIGH</div>
                        </div>
                        <div className="bg-gradient-to-r from-gray-800 to-blue-900/40 p-6 rounded-2xl border-l-4 border-blue-500 flex items-center justify-between">
                            <div>
                                <h4 className="text-xl font-bold text-white">Sirius</h4>
                                <p className="text-xs text-blue-300">Премиум. Лидер по узнаваемости.</p>
                            </div>
                            <div className="text-2xl font-black text-gray-600">MID</div>
                        </div>
                        <div className="bg-gradient-to-r from-gray-800 to-amber-900/40 p-6 rounded-2xl border-l-4 border-amber-500 flex items-center justify-between">
                            <div>
                                <h4 className="text-xl font-bold text-white">Наш Рацион</h4>
                                <p className="text-xs text-amber-300">Эконом. Генератор объема.</p>
                            </div>
                            <div className="text-2xl font-black text-gray-600">ECO</div>
                        </div>
                        <div className="bg-gradient-to-r from-gray-800 to-rose-900/40 p-6 rounded-2xl border-l-4 border-rose-500 flex items-center justify-between">
                            <div>
                                <h4 className="text-xl font-bold text-white">Happy Lappi</h4>
                                <p className="text-xs text-rose-300">Специально для FMCG.</p>
                            </div>
                            <div className="text-2xl font-black text-gray-600">RETAIL</div>
                        </div>
                    </div>
                )
            },
            {
                id: '3-3', title: 'Диспропорция: Объем vs Деньги',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center h-full">
                        <div className="flex flex-col items-center">
                            <h4 className="text-sm font-bold text-gray-400 uppercase mb-4 tracking-widest">Доли в ОБЪЕМЕ (Тонны)</h4>
                            <div className="w-64 h-64 relative">
                                <Pie data={{
                                    labels: ['Наш Рацион', 'Sirius', 'AJO', 'Одно Мясо', 'Happy Lappi'],
                                    datasets: [{
                                        data: [48, 32, 12, 3, 5],
                                        backgroundColor: ['#fbbf24', '#3b82f6', '#6366f1', '#a855f7', '#f43f5e'],
                                        borderWidth: 0
                                    }]
                                }} options={{ plugins: { legend: { display: false } } }} />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-4xl font-black text-white/20">KG</span>
                                </div>
                            </div>
                            <div className="text-center mt-4 text-xs text-amber-400">"Наш Рацион" = 48% объема</div>
                        </div>
                        <div className="flex flex-col items-center">
                            <h4 className="text-sm font-bold text-gray-400 uppercase mb-4 tracking-widest">Доли в ВЫРУЧКЕ (Рубли)</h4>
                            <div className="w-64 h-64 relative">
                                <Pie data={{
                                    labels: ['Наш Рацион', 'Sirius', 'AJO', 'Одно Мясо', 'Happy Lappi'],
                                    datasets: [{
                                        data: [18, 38, 35, 7, 2],
                                        backgroundColor: ['#fbbf24', '#3b82f6', '#6366f1', '#a855f7', '#f43f5e'],
                                        borderWidth: 0
                                    }]
                                }} options={{ plugins: { legend: { display: false } } }} />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-4xl font-black text-white/20">RUB</span>
                                </div>
                            </div>
                            <div className="text-center mt-4 text-xs text-indigo-400">AJO + Sirius = 73% денег</div>
                        </div>
                    </div>
                )
            },
            {
                id: '3-4', title: 'Стратегические задачи',
                content: (
                    <div className="space-y-4 overflow-y-auto max-h-[400px] custom-scrollbar pr-2">
                        <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-white">Одно Мясо, AJO, Sirius</span>
                                <span className="text-emerald-400 font-bold">$$$</span>
                            </div>
                            <p className="text-sm text-gray-400">Увеличение объемов продаж для кратного роста доходности (High Margin).</p>
                        </div>
                        <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-white">AJO, Sirius</span>
                                <span className="text-indigo-400 font-bold">Лояльность</span>
                            </div>
                            <p className="text-sm text-gray-400">Укрепление позиций, признание, воспитание любви к продукту.</p>
                        </div>
                        <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-white">Одно Мясо</span>
                                <span className="text-purple-400 font-bold">Имидж</span>
                            </div>
                            <p className="text-sm text-gray-400">Изменить отношение к Российскому "Люксу". Смена менталитета.</p>
                        </div>
                        <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-white">Наш Рацион</span>
                                <span className="text-amber-400 font-bold">Стабильность</span>
                            </div>
                            <p className="text-sm text-gray-400">Цена-Качество. "Эконом" не значит плохо.</p>
                        </div>
                        <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-white">Happy Lappi</span>
                                <span className="text-rose-400 font-bold">Экспансия</span>
                            </div>
                            <p className="text-sm text-gray-400">Кратный рост в FMCG канале.</p>
                        </div>
                    </div>
                )
            }
        ],
        4: [
            {
                id: '4-1', title: 'Каналы сбыта',
                content: (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {[
                            'Зоо Сети', 'Зоо Розница', 'Ветеринарный', 
                            'Бридер (Питомники)', 'Спец. Канал (Тендеры)', 
                            'Интернет (E-com)', 'FMCG (Ритейл)'
                        ].map((c, i) => (
                            <div key={i} className="bg-gray-800/60 p-4 rounded-xl text-center border border-white/5 hover:bg-gray-800 transition-colors">
                                <div className="text-white font-bold text-sm">{c}</div>
                            </div>
                        ))}
                    </div>
                )
            },
            {
                id: '4-2', title: 'Распределение долей (Тренды)',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full items-center">
                        <div>
                            <h4 className="text-center font-bold text-gray-400 mb-4 uppercase text-xs">Сейчас</h4>
                            <Doughnut data={{
                                labels: ['Розница', 'Сети', 'E-com', 'FMCG'],
                                datasets: [{ data: [40, 25, 20, 15], backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#fbbf24'], borderWidth: 0 }]
                            }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }} />
                        </div>
                        <div>
                            <h4 className="text-center font-bold text-gray-400 mb-4 uppercase text-xs">Через 5-10 лет</h4>
                            <Doughnut data={{
                                labels: ['Розница', 'Сети', 'E-com', 'FMCG'],
                                datasets: [{ data: [20, 25, 40, 15], backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#fbbf24'], borderWidth: 0 }]
                            }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }} />
                        </div>
                        <div className="md:col-span-2 text-center text-sm text-gray-400 mt-4 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                            <strong>Тренд:</strong> Драматический переток из традиционной розницы в <span className="text-rose-400 font-bold">E-com</span>. Сети и FMCG стабильны.
                        </div>
                    </div>
                )
            },
            {
                id: '4-3', title: 'Целеполагание по брендам',
                content: (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Канал</th>
                                    <th className="px-4 py-3">Ключевой Бренд</th>
                                    <th className="px-4 py-3">Тренд</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                <tr><td className="px-4 py-3">Зоо Сети</td><td className="px-4 py-3 font-bold text-indigo-400">AJO</td><td className="px-4 py-3">Экспертность, Премиумизация</td></tr>
                                <tr><td className="px-4 py-3">Розница</td><td className="px-4 py-3 font-bold text-blue-400">Sirius</td><td className="px-4 py-3">Базовая доступность</td></tr>
                                <tr><td className="px-4 py-3">FMCG</td><td className="px-4 py-3 font-bold text-rose-400">Happy Lappi</td><td className="px-4 py-3">Импульсный спрос, Трафик</td></tr>
                                <tr><td className="px-4 py-3">Интернет</td><td className="px-4 py-3 font-bold text-white">ВСЕ</td><td className="px-4 py-3">Бесконечная полка, Отзывы</td></tr>
                            </tbody>
                        </table>
                    </div>
                )
            },
            {
                id: '4-4', title: 'Инструменты укрепления',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                        <div className="bg-gray-800/40 p-6 rounded-2xl border-t-4 border-emerald-500">
                            <h4 className="text-xl font-bold text-white mb-4">Offline (Полка)</h4>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li>✅ Увеличение ассортимента (Сухой + Влажный)</li>
                                <li>✅ Расширение АКБ (Активной Клиентской Базы)</li>
                                <li>✅ Установка фирменного оборудования</li>
                                <li>✅ Share of Shelf (Доля полки)</li>
                            </ul>
                        </div>
                        <div className="bg-gray-800/40 p-6 rounded-2xl border-t-4 border-indigo-500">
                            <h4 className="text-xl font-bold text-white mb-4">Online (Экран)</h4>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li>✅ Rich-контент и карточки товара</li>
                                <li>✅ Работа с отзывами и рейтингом</li>
                                <li>✅ Retail Media (реклама внутри площадок)</li>
                                <li>✅ Персонализированные рекомендации (AI)</li>
                            </ul>
                        </div>
                    </div>
                )
            },
            {
                id: '4-5', title: 'Вектор 2026',
                content: (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
                        <div className="text-6xl animate-bounce">🚀</div>
                        <h3 className="text-3xl font-black text-white">Стратегия Соответствия</h3>
                        <p className="text-xl text-gray-300 max-w-2xl">
                            Структура продаж компании должна зеркально отражать структуру рынка. Мы идем туда, где наш покупатель.
                        </p>
                        <div className="p-4 bg-indigo-900/20 rounded-xl border border-indigo-500/30 text-indigo-300 text-sm">
                            Более детальную информацию по развитию каждого канала расскажут руководители направлений.
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
            <div className="flex bg-gray-900/50 p-1.5 rounded-2xl border border-gray-800 self-start shadow-xl overflow-x-auto max-w-full">
                {blocks.map(b => (
                    <button 
                        key={b.id} 
                        onClick={() => { setActiveBlock(b.id); setCurrentSlideIndex(0); }}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeBlock === b.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {b.title}
                    </button>
                ))}
            </div>

            {/* Slide Container */}
            <div className="flex-grow bg-gray-900/30 rounded-3xl border border-indigo-500/10 p-6 md:p-10 flex flex-col relative overflow-hidden backdrop-blur-sm shadow-2xl">
                {/* Background Decor */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none"></div>
                
                {/* Slide Title */}
                <div className="mb-6 md:mb-10 flex flex-col md:flex-row justify-between items-start gap-4">
                    <div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                            {blocks.find(b => b.id === activeBlock)?.title}
                        </span>
                        <h2 className="text-2xl md:text-4xl font-black text-white mt-4 tracking-tight drop-shadow-md leading-tight">
                            {currentSlide.title}
                        </h2>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-xs font-mono text-gray-600 bg-gray-900/50 px-3 py-1 rounded-lg border border-gray-800">
                            Слайд {currentSlideIndex + 1} / {slides[activeBlock].length}
                        </div>
                    </div>
                </div>

                {/* Slide Content */}
                <div className="flex-grow flex flex-col justify-center w-full overflow-y-auto custom-scrollbar">
                    {currentSlide.content}
                </div>

                {/* Bottom Navigation */}
                <div className="mt-auto pt-6 md:pt-10 flex justify-between items-center border-t border-white/5">
                    <button 
                        onClick={prevSlide}
                        disabled={activeBlock === 1 && currentSlideIndex === 0}
                        className="p-3 md:p-4 rounded-full bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all border border-gray-700 shadow-xl active:scale-90 flex items-center justify-center"
                    >
                        <svg className="w-5 h-5 md:w-6 md:h-6 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                    
                    <div className="flex gap-2">
                        {slides[activeBlock].map((_, idx) => (
                            <div key={idx} className={`h-1.5 transition-all duration-300 rounded-full cursor-pointer hover:bg-indigo-400 ${idx === currentSlideIndex ? 'w-8 bg-indigo-500' : 'w-2 bg-gray-800'}`} onClick={() => setCurrentSlideIndex(idx)}></div>
                        ))}
                    </div>

                    <button 
                        onClick={nextSlide}
                        disabled={activeBlock === 4 && currentSlideIndex === slides[4].length - 1}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 md:py-4 md:px-10 rounded-2xl flex items-center gap-3 transition-all shadow-lg shadow-indigo-900/40 disabled:opacity-20 active:scale-90 text-sm md:text-base"
                    >
                        <span>Далее</span>
                        <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </div>
            
            <div className="text-center text-[8px] md:text-[10px] text-gray-700 uppercase font-bold tracking-[0.2em] md:tracking-[0.3em]">
                Limkorm Group • Annual Report 2025 • Confidential
            </div>
        </div>
    );
};

export default Presentation;
