
import React, { useState } from 'react';
import { Doughnut, Pie } from 'react-chartjs-2';
import { TargetIcon, BrainIcon, TrendingUpIcon, UsersIcon, DataIcon, CheckIcon, WarningIcon } from '../icons';
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
                        <p className="text-xl text-gray-300 leading-relaxed text-center">
                            Зообизнес — это не просто рынок товаров для животных, а комплексная экосистема, охватывающая производство, 
                            сервис, ветеринарию и эмоциональную связь между владельцем и питомцем.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/20 shadow-xl text-center">
                                <div className="text-indigo-400 mb-4 mx-auto"><UsersIcon /></div>
                                <h4 className="font-bold text-white mb-2">Гуманизация</h4>
                                <p className="text-sm text-gray-400">Питомец — член семьи. Смена парадигмы потребления: от "корма" к "питанию".</p>
                            </div>
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/20 shadow-xl text-center">
                                <div className="text-emerald-400 mb-4 mx-auto"><DataIcon /></div>
                                <h4 className="font-bold text-white mb-2">Инновации</h4>
                                <p className="text-sm text-gray-400">Технологичные рационы, функциональное питание, диджитализация каналов продаж.</p>
                            </div>
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-indigo-500/20 shadow-xl text-center">
                                <div className="text-amber-400 mb-4 mx-auto"><TrendingUpIcon /></div>
                                <h4 className="font-bold text-white mb-2">Рост Рынка</h4>
                                <p className="text-sm text-gray-400">Устойчивый рост даже в кризис. Переход в эру осознанного владения.</p>
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
                                    { yr: '1990-2000', t: 'Хаос и Импорт', desc: 'Зарождение рынка. Доминирование импорта ("ножки Буша"). Первые ларьки.' },
                                    { yr: '2000-2010', t: 'Становление Розницы', desc: 'Появление сетей. Приход глобальных игроков (Mars, Nestle). Стандартизация.' },
                                    { yr: '2010-2020', t: 'Зрелость и E-com', desc: 'Развитие специализации. Бум интернет-торговли. Рост культуры потребления.' },
                                    { yr: '2020-2025+', t: 'Трансформация', desc: 'Импортозамещение. Экосистемы. Технологический суверенитет. Limkorm Group.' }
                                ].map((item, i) => (
                                    <div key={i} className="text-center w-1/4 px-2">
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
                id: '1-3', title: 'Зообизнес через 5-10 лет',
                content: (
                    <div className="bg-indigo-900/10 border border-indigo-500/20 p-8 rounded-3xl">
                        <h4 className="text-indigo-300 font-bold text-lg mb-6 flex items-center gap-2"><BrainIcon /> Вектор трансформации и развития</h4>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-8 text-gray-300">
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400 font-bold">01</div>
                                <div><strong className="text-white block mb-1">Персонализация</strong> Индивидуальные рационы на основе ДНК-тестов и образа жизни питомца.</div>
                            </li>
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400 font-bold">02</div>
                                <div><strong className="text-white block mb-1">Preventive Health</strong> Корм как инструмент профилактики. Слияние ветеринарии и питания.</div>
                            </li>
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400 font-bold">03</div>
                                <div><strong className="text-white block mb-1">Эко-ответственность</strong> Устойчивое производство, перерабатываемая упаковка, альтернативные протеины.</div>
                            </li>
                            <li className="flex gap-4 items-start">
                                <div className="p-2 bg-indigo-500/20 rounded text-indigo-400 font-bold">04</div>
                                <div><strong className="text-white block mb-1">Omni-Channel 3.0</strong> Бесшовный опыт покупки: подписка, экспресс-доставка, умные полки.</div>
                            </li>
                        </ul>
                    </div>
                )
            },
            {
                id: '1-4', title: 'Основные тренды современного зообизнеса',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gray-800/40 p-5 rounded-xl border border-emerald-500/30">
                            <h5 className="text-emerald-400 font-bold mb-2">Натуральность</h5>
                            <p className="text-xs text-gray-400">Clean Label. Понятный состав. Отказ от искусственных добавок. "Как для людей".</p>
                        </div>
                        <div className="bg-gray-800/40 p-5 rounded-xl border border-indigo-500/30">
                            <h5 className="text-indigo-400 font-bold mb-2">Локализация</h5>
                            <p className="text-xs text-gray-400">Доверие к российскому производителю. Стабильность поставок. Свежесть.</p>
                        </div>
                        <div className="bg-gray-800/40 p-5 rounded-xl border border-purple-500/30">
                            <h5 className="text-purple-400 font-bold mb-2">Эмоциональный маркетинг</h5>
                            <p className="text-xs text-gray-400">Бренд как друг и эксперт. Сообщества (Community). Контент-маркетинг.</p>
                        </div>
                        <div className="bg-gray-800/40 p-5 rounded-xl border border-amber-500/30">
                            <h5 className="text-amber-400 font-bold mb-2">Рациональность</h5>
                            <p className="text-xs text-gray-400">Цена/Качество. Потребитель считает деньги, но не готов жертвовать здоровьем питомца.</p>
                        </div>
                    </div>
                )
            },
            {
                id: '1-5', title: 'Лимкорм Групп в зообизнесе России',
                content: (
                    <div className="flex flex-col md:flex-row gap-10 items-center justify-center h-full">
                        <div className="flex-1 space-y-8">
                            <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-8 rounded-3xl border-l-8 border-indigo-500 shadow-2xl">
                                <h4 className="text-3xl font-black text-white mb-4">Игрок №1</h4>
                                <p className="text-gray-300 text-lg">
                                    Лимкорм Групп — не просто завод, а драйвер индустрии. Мы задаем стандарты качества и формируем культуру производства кормов в России.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-800/50 p-4 rounded-xl text-center">
                                    <div className="text-2xl font-bold text-white">Лидер</div>
                                    <div className="text-xs text-gray-500 uppercase">По мощностям</div>
                                </div>
                                <div className="bg-gray-800/50 p-4 rounded-xl text-center">
                                    <div className="text-2xl font-bold text-white">Эксперт</div>
                                    <div className="text-xs text-gray-500 uppercase">В технологиях</div>
                                </div>
                            </div>
                        </div>
                        <div className="w-80 h-80 relative flex items-center justify-center">
                            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
                            <div className="relative z-10 text-center">
                                <div className="text-6xl font-black text-white mb-2 drop-shadow-lg">LIMKORM</div>
                                <div className="text-sm text-indigo-300 uppercase tracking-[0.5em] font-bold">GROUP</div>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full items-center">
                        <div className="bg-gray-800/60 p-8 rounded-3xl border border-indigo-500/20 text-center h-64 flex flex-col justify-center relative overflow-hidden group hover:border-indigo-500/50 transition-all">
                            <div className="absolute -right-4 -top-4 text-9xl text-white/5 font-black group-hover:text-white/10 transition-all">НТМ</div>
                            <div className="text-4xl font-black text-indigo-400 mb-2">45%</div>
                            <div className="text-xl font-bold text-white mb-2">Наши Торговые Марки</div>
                            <p className="text-sm text-gray-400">Флагманы продаж. Лицо компании. Основной источник маржинальности.</p>
                        </div>
                        <div className="bg-gray-800/60 p-8 rounded-3xl border border-emerald-500/20 text-center h-64 flex flex-col justify-center relative overflow-hidden group hover:border-emerald-500/50 transition-all">
                            <div className="absolute -right-4 -top-4 text-9xl text-white/5 font-black group-hover:text-white/10 transition-all">СТМ</div>
                            <div className="text-4xl font-black text-emerald-400 mb-2">30%</div>
                            <div className="text-xl font-bold text-white mb-2">Собственные Торговые Марки</div>
                            <p className="text-sm text-gray-400">Стратегическое партнерство с сетями. Загрузка мощностей. Стабильность.</p>
                        </div>
                        <div className="bg-gray-800/60 p-8 rounded-3xl border border-cyan-500/20 text-center h-64 flex flex-col justify-center relative overflow-hidden group hover:border-cyan-500/50 transition-all">
                            <div className="absolute -right-4 -top-4 text-9xl text-white/5 font-black group-hover:text-white/10 transition-all">Fish</div>
                            <div className="text-4xl font-black text-cyan-400 mb-2">25%</div>
                            <div className="text-xl font-bold text-white mb-2">Аквакультура</div>
                            <p className="text-sm text-gray-400">Высокотехнологичный сегмент. Корма для рыб. Точка кратного роста.</p>
                        </div>
                    </div>
                )
            },
            {
                id: '2-2', title: 'Этапы развития и Сравнение',
                content: (
                    <div className="space-y-8">
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700">
                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Хронология Лимкорм</h4>
                            <div className="flex justify-between items-center text-xs">
                                <div className="text-center"><span className="block text-lg font-bold text-white">2015</span><span className="text-gray-500">Запуск завода</span></div>
                                <div className="h-0.5 bg-gray-700 flex-grow mx-4"></div>
                                <div className="text-center"><span className="block text-lg font-bold text-white">2018</span><span className="text-gray-500">Выход Sirius</span></div>
                                <div className="h-0.5 bg-gray-700 flex-grow mx-4"></div>
                                <div className="text-center"><span className="block text-lg font-bold text-white">2021</span><span className="text-gray-500">Запуск AJO</span></div>
                                <div className="h-0.5 bg-gray-700 flex-grow mx-4"></div>
                                <div className="text-center"><span className="block text-lg font-bold text-white">2024</span><span className="text-gray-500">Лидер рынка</span></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                            <div className="border-r border-gray-700 pr-8">
                                <h4 className="text-xl font-bold text-indigo-400 mb-4">Запад (Mars/Nestle)</h4>
                                <ul className="space-y-2 text-sm text-gray-400">
                                    <li>• 100+ лет истории. Медленная эволюция.</li>
                                    <li>• Глобальный маркетинг, унификация.</li>
                                    <li>• Долгое принятие решений (бюрократия).</li>
                                    <li>• Фокус на "Mass Market" и доступность.</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-xl font-bold text-emerald-400 mb-4">Лимкорм Групп</h4>
                                <ul className="space-y-2 text-sm text-gray-400">
                                    <li>• 10 лет взрывного роста. Квантовый скачок.</li>
                                    <li>• Адаптация под российский менталитет "здесь и сейчас".</li>
                                    <li>• Гибкость, скорость R&D (High Speed).</li>
                                    <li>• Фокус на качество и состав (Technology First).</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '2-3', title: 'Выстраивание экосистемы',
                content: (
                    <div className="flex items-center justify-center h-full">
                        <div className="relative w-[500px] h-[300px]">
                            {/* Central Core */}
                            <div className="absolute inset-0 m-auto w-32 h-32 bg-white rounded-full flex items-center justify-center z-20 shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                <div className="text-center">
                                    <div className="text-black font-black text-xl">LIMKORM</div>
                                    <div className="text-[10px] text-gray-600 font-bold">ECOSYSTEM</div>
                                </div>
                            </div>
                            
                            {/* Satellites */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-40">
                                <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-2 flex items-center justify-center text-2xl">🏭</div>
                                <div className="text-sm font-bold text-white">Производство</div>
                                <div className="text-[10px] text-gray-400">Завод, R&D, Лаборатория</div>
                            </div>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 text-center w-40">
                                <div className="w-16 h-16 bg-emerald-600 rounded-2xl mx-auto mb-2 flex items-center justify-center text-2xl">🛒</div>
                                <div className="text-sm font-bold text-white">Сбыт</div>
                                <div className="text-[10px] text-gray-400">Дистрибьюторы, Сети, E-com</div>
                            </div>
                            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-40">
                                <div className="w-16 h-16 bg-amber-600 rounded-2xl mx-auto mb-2 flex items-center justify-center text-2xl">🤝</div>
                                <div className="text-sm font-bold text-white">Партнеры</div>
                                <div className="text-[10px] text-gray-400">Поставщики, Логистика</div>
                            </div>
                            <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 text-center w-40">
                                <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto mb-2 flex items-center justify-center text-2xl">❤️</div>
                                <div className="text-sm font-bold text-white">Клиент</div>
                                <div className="text-[10px] text-gray-400">Сервис, Обучение, Клубы</div>
                            </div>

                            {/* Orbit Rings */}
                            <div className="absolute inset-0 border-2 border-dashed border-gray-700 rounded-full z-0 animate-spin-slow"></div>
                        </div>
                    </div>
                )
            },
            {
                id: '2-4', title: 'Современный сервис для покупателя',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                        <div className="space-y-6">
                            <h4 className="text-2xl font-bold text-white">Что это такое?</h4>
                            <p className="text-gray-300">
                                Это больше, чем просто наличие товара на полке. Это совокупность удобства, скорости, информации и эмоций, сопровождающих покупку.
                            </p>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-lg"><CheckIcon className="text-emerald-400" /> <span>Омниканальность (везде, где удобно)</span></li>
                                <li className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-lg"><CheckIcon className="text-emerald-400" /> <span>Скорость доставки (Last Mile)</span></li>
                                <li className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-lg"><CheckIcon className="text-emerald-400" /> <span>Персонализированная консультация</span></li>
                            </ul>
                        </div>
                        <div className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 p-8 rounded-3xl border border-white/5 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-5xl mb-4">🚀</div>
                                <div className="text-white font-bold text-lg">SERVICE 2.0</div>
                                <div className="text-cyan-300 text-xs mt-2">От продукта к решению</div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '2-5', title: 'Как стать ближе к покупателю?',
                content: (
                    <div className="space-y-8">
                        <div className="grid grid-cols-3 gap-6">
                            <div className="bg-gray-800 p-6 rounded-2xl text-center border-t-4 border-indigo-500">
                                <div className="text-indigo-400 text-2xl font-bold mb-2">Цифра</div>
                                <p className="text-xs text-gray-400">Мобильные приложения, подписка на корм, QR-коды с историей продукта.</p>
                            </div>
                            <div className="bg-gray-800 p-6 rounded-2xl text-center border-t-4 border-emerald-500">
                                <div className="text-emerald-400 text-2xl font-bold mb-2">Локация</div>
                                <p className="text-xs text-gray-400">Присутствие "у дома". Расширение дистрибуции в малые форматы.</p>
                            </div>
                            <div className="bg-gray-800 p-6 rounded-2xl text-center border-t-4 border-amber-500">
                                <div className="text-amber-400 text-2xl font-bold mb-2">Диалог</div>
                                <p className="text-xs text-gray-400">Горячая линия 24/7, чат-боты, работа с отзывами на маркетплейсах.</p>
                            </div>
                        </div>
                        <p className="text-center text-lg text-white font-medium">"Сервис сокращает дистанцию между Брендом и Сердцем покупателя."</p>
                    </div>
                )
            },
            {
                id: '2-6', title: 'Выстраивание сервиса: Вызов 2026',
                content: (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-red-600 rounded-xl text-white font-bold animate-pulse">CHALLENGE 2026</div>
                            <h4 className="text-xl font-bold text-white">Стать эталоном сервиса в зооиндустрии РФ</h4>
                        </div>
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-700">
                            <h5 className="text-sm font-bold text-gray-400 uppercase mb-4">Этапы построения</h5>
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold border border-gray-600">1</div>
                                    <div className="bg-gray-800/50 flex-grow p-3 rounded-lg"><strong className="text-indigo-400">Аудит:</strong> Оценка текущего пути клиента (CJM).</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold border border-gray-600">2</div>
                                    <div className="bg-gray-800/50 flex-grow p-3 rounded-lg"><strong className="text-indigo-400">Стандартизация:</strong> Единые скрипты и регламенты для всех партнеров.</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold border border-gray-600">3</div>
                                    <div className="bg-gray-800/50 flex-grow p-3 rounded-lg"><strong className="text-indigo-400">Цифровизация:</strong> Внедрение CRM и AI-помощников.</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold border border-gray-600">4</div>
                                    <div className="bg-gray-800/50 flex-grow p-3 rounded-lg"><strong className="text-indigo-400">Масштабирование:</strong> Трансляция стандартов на всю сеть дистрибуции.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '2-7', title: 'Любовь к российскому продукту',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                            <h4 className="text-2xl font-bold text-white">Вызов: Доверие и Любовь</h4>
                            <p className="text-gray-400 text-sm">
                                Привить гордость за "Сделано в России". Сломать стереотип, что импортное лучше.
                            </p>
                            <h5 className="font-bold text-indigo-400 uppercase text-xs tracking-widest mt-4">Инструменты</h5>
                            <ul className="space-y-3 text-sm">
                                <li className="flex gap-2"><span className="text-emerald-500">✔</span> <span>Открытость: Экскурсии на завод (онлайн/оффлайн).</span></li>
                                <li className="flex gap-2"><span className="text-emerald-500">✔</span> <span>Экспертиза: Образовательные программы для владельцев.</span></li>
                                <li className="flex gap-2"><span className="text-emerald-500">✔</span> <span>Гарантия: "Съест или вернем деньги".</span></li>
                                <li className="flex gap-2"><span className="text-emerald-500">✔</span> <span>Сообщество: Клубы любителей брендов.</span></li>
                            </ul>
                        </div>
                        <div className="flex items-center justify-center">
                            <div className="relative w-64 h-64 bg-red-600/10 rounded-full flex items-center justify-center border border-red-500/30 animate-pulse">
                                <div className="text-center">
                                    <div className="text-6xl mb-2">❤️</div>
                                    <div className="text-white font-bold text-lg">LOVE BRAND</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        ],
        3: [
            {
                id: '3-1', title: 'Бренд: Ценность и сила',
                content: (
                    <div className="space-y-8">
                        <p className="text-xl text-gray-300">
                            Бренд — это обещание, которое компания дает потребителю. Это нематериальный актив, формирующий добавленную стоимость.
                        </p>
                        <div className="bg-gray-800/40 p-6 rounded-2xl border border-white/5">
                            <h4 className="font-bold text-white mb-4">Роль брендов-локомотивов</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <div className="text-indigo-400 font-bold mb-1">Финансы</div>
                                    <p className="text-xs text-gray-400">Генерируют основной денежный поток (Cash Cow).</p>
                                </div>
                                <div>
                                    <div className="text-indigo-400 font-bold mb-1">Рынок</div>
                                    <p className="text-xs text-gray-400">Захватывают полку и внимание, прокладывая путь для новинок.</p>
                                </div>
                                <div>
                                    <div className="text-indigo-400 font-bold mb-1">Имидж</div>
                                    <p className="text-xs text-gray-400">Формируют репутацию надежного производителя.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '3-2', title: 'Портфель брендов Лидера №1',
                content: (
                    <div className="space-y-8 text-center">
                        <h3 className="text-3xl font-black text-white uppercase">Limkorm Group — Производитель №1 в РФ</h3>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-8">
                            {['Одно Мясо', 'AJO', 'Sirius', 'Наш Рацион', 'Happy Lappi'].map((b, i) => (
                                <div key={i} className="bg-white p-4 rounded-xl flex items-center justify-center h-32 shadow-lg transform hover:scale-105 transition-transform duration-300 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-white to-gray-200"></div>
                                    <span className="relative z-10 text-black font-bold text-lg">{b}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-gray-400 text-sm mt-4">Полное покрытие всех ценовых сегментов: от Эконома до Холистика.</p>
                    </div>
                )
            },
            {
                id: '3-3', title: 'Диспропорция: Объем vs Деньги',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                        <div className="space-y-4">
                            <div className="h-64 flex flex-col items-center">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">Доля в ОБЪЕМЕ (Тонны)</h4>
                                <Pie data={{
                                    labels: ['Наш Рацион', 'Sirius', 'AJO', 'Другие'],
                                    datasets: [{ data: [45, 35, 15, 5], backgroundColor: ['#fbbf24', '#818cf8', '#34d399', '#4b5563'], borderWidth: 0 }]
                                }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }} />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="h-64 flex flex-col items-center">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">Доля в ВЫРУЧКЕ (Рубли)</h4>
                                <Pie data={{
                                    labels: ['Наш Рацион', 'Sirius', 'AJO', 'Другие'],
                                    datasets: [{ data: [20, 40, 35, 5], backgroundColor: ['#fbbf24', '#818cf8', '#34d399', '#4b5563'], borderWidth: 0 }]
                                }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }} />
                            </div>
                        </div>
                        <div className="md:col-span-2 bg-gray-800/50 p-4 rounded-xl border border-amber-500/30 text-center">
                            <p className="text-sm text-amber-400 font-bold">⚠️ ДИСПРОПОРЦИЯ: "Наш Рацион" дает почти половину тоннажа, но лишь 20% денег. AJO — драйвер маржинальности.</p>
                        </div>
                    </div>
                )
            },
            {
                id: '3-4', title: 'Стратегические задачи по брендам',
                content: (
                    <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[400px] custom-scrollbar pr-2">
                        <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border-l-4 border-emerald-500">
                            <h5 className="font-bold text-white text-lg">Одно Мясо, AJO, Sirius</h5>
                            <p className="text-sm text-gray-400 mt-1">Задача: <span className="text-emerald-400 font-bold">Кратный рост доходности</span>. Увеличение объемов в высокомаржинальных сегментах.</p>
                        </div>
                        <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border-l-4 border-indigo-500">
                            <h5 className="font-bold text-white text-lg">AJO, Sirius</h5>
                            <p className="text-sm text-gray-400 mt-1">Задача: <span className="text-indigo-400 font-bold">Укрепление позиций и Лояльность</span>. Признание, воспитание любви к продукту.</p>
                        </div>
                        <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border-l-4 border-purple-500">
                            <h5 className="font-bold text-white text-lg">Одно Мясо (Люкс)</h5>
                            <p className="text-sm text-gray-400 mt-1">Задача: <span className="text-purple-400 font-bold">Изменение менталитета</span>. Доказать, что российский супер-премиум существует.</p>
                        </div>
                        <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border-l-4 border-amber-500">
                            <h5 className="font-bold text-white text-lg">Наш Рацион (Эконом)</h5>
                            <p className="text-sm text-gray-400 mt-1">Задача: <span className="text-amber-400 font-bold">Стабильность и Качество</span>. Воспитание понятия "Цена-Качество". Эконом — не значит плохо.</p>
                        </div>
                        <div className="p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border-l-4 border-rose-500">
                            <h5 className="font-bold text-white text-lg">Хаппи Лаппи (FMCG)</h5>
                            <p className="text-sm text-gray-400 mt-1">Задача: <span className="text-rose-400 font-bold">Экспансия в ритейл</span>. Кратное увеличение объемов, выход к новому массовому покупателю.</p>
                        </div>
                        <div className="mt-4 text-center text-sm text-gray-500 font-bold">БРЕНДЫ — ЭТО АКТИВЫ КОМПАНИИ. ИХ РАЗВИТИЕ = РОСТ СТОИМОСТИ БИЗНЕСА.</div>
                    </div>
                )
            }
        ],
        4: [
            {
                id: '4-1', title: 'Каналы сбыта: Экосистема продаж',
                content: (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                             {[
                                 {n: 'Зоо Сети', d: 'Национальные и Локальные'},
                                 {n: 'Зоо Розница', d: 'Традиционная розница'},
                                 {n: 'Вет. Канал', d: 'Клиники и аптеки'},
                                 {n: 'Бридер Канал', d: 'Заводчики, клубы, приюты'},
                                 {n: 'Спец. Канал', d: 'Тендеры, госструктуры'},
                                 {n: 'Интернет', d: 'Маркетплейсы, E-com'},
                                 {n: 'FMCG', d: 'Продуктовый ритейл'}
                             ].map((c, i) => (
                                 <div key={i} className="bg-gray-800/50 p-4 rounded-xl text-center border border-indigo-500/10 hover:border-indigo-500 transition-colors cursor-default">
                                     <div className="text-white font-bold text-sm mb-1">{c.n}</div>
                                     <div className="text-[10px] text-gray-500 leading-tight">{c.d}</div>
                                 </div>
                             ))}
                        </div>
                        <div className="bg-indigo-900/10 p-4 rounded-xl border border-indigo-500/20">
                            <h5 className="text-indigo-300 font-bold text-xs uppercase mb-2">Современные тренды</h5>
                            <ul className="text-xs text-gray-400 space-y-1">
                                <li>• Размытие границ каналов (Omnichannel).</li>
                                <li>• Рост роли экспертного канала (Вет и Бридер) как точки входа.</li>
                                <li>• Маркетплейсы как основной поисковик товаров.</li>
                            </ul>
                        </div>
                    </div>
                )
            },
            {
                id: '4-2', title: 'Доли каналов: Сегодня и Завтра',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-gray-800/40 p-6 rounded-2xl">
                            <h4 className="text-center font-bold text-white mb-4">Текущее распределение (2025)</h4>
                            <Doughnut data={{
                                labels: ['Розница', 'Сети', 'Интернет', 'FMCG', 'Прочее'],
                                datasets: [{ data: [40, 25, 20, 10, 5], backgroundColor: ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#9ca3af'], borderWidth: 0 }]
                            }} options={{ plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 } } } } }} />
                        </div>
                        <div className="space-y-6">
                            <h4 className="text-center font-bold text-indigo-400">Тенденции (5-10 лет)</h4>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs text-white mb-1"><span>Интернет</span><span className="text-emerald-400">▲ Рост до 45%</span></div>
                                    <div className="w-full bg-gray-700 h-2 rounded-full"><div className="bg-emerald-500 h-2 rounded-full" style={{width: '90%'}}></div></div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-white mb-1"><span>Зоо Розница</span><span className="text-red-400">▼ Снижение до 20%</span></div>
                                    <div className="w-full bg-gray-700 h-2 rounded-full"><div className="bg-red-500 h-2 rounded-full" style={{width: '40%'}}></div></div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-white mb-1"><span>Зоо Сети + FMCG</span><span className="text-amber-400">▶ Стабилизация</span></div>
                                    <div className="w-full bg-gray-700 h-2 rounded-full"><div className="bg-amber-500 h-2 rounded-full" style={{width: '70%'}}></div></div>
                                </div>
                            </div>
                            <div className="p-4 bg-gray-900/50 rounded-xl text-xs text-gray-400 border border-gray-700">
                                <strong>Сравнительный анализ:</strong> Рынок движется в онлайн быстрее, чем компания. Необходимо форсировать развитие E-com канала.
                            </div>
                        </div>
                    </div>
                )
            },
            {
                id: '4-3', title: 'Целеполагание и эффективность',
                content: (
                    <div className="space-y-6">
                        <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900/30">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-800 text-gray-400 uppercase">
                                    <tr>
                                        <th className="px-4 py-3">Бренд</th>
                                        <th className="px-4 py-3">Приоритетный канал</th>
                                        <th className="px-4 py-3">Роль в канале</th>
                                        <th className="px-4 py-3">Перспектива 5-10 лет</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800 text-gray-300">
                                    <tr><td className="px-4 py-3 font-bold">AJO</td><td className="px-4 py-3">Зоо Сети / Вет</td><td className="px-4 py-3">Экспертный лидер</td><td className="px-4 py-3 text-emerald-400">Доминирование в премиуме</td></tr>
                                    <tr><td className="px-4 py-3 font-bold">Sirius</td><td className="px-4 py-3">Розница / Интернет</td><td className="px-4 py-3">Базовый выбор</td><td className="px-4 py-3 text-indigo-400">Стабильный рост</td></tr>
                                    <tr><td className="px-4 py-3 font-bold">Happy Lappi</td><td className="px-4 py-3">FMCG</td><td className="px-4 py-3">Трафикообразующий</td><td className="px-4 py-3 text-amber-400">Захват полки супермаркетов</td></tr>
                                    <tr><td className="px-4 py-3 font-bold">Одно Мясо</td><td className="px-4 py-3">Бутики / Интернет</td><td className="px-4 py-3">Нишевый эксклюзив</td><td className="px-4 py-3 text-purple-400">Культовый статус</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            },
            {
                id: '4-4', title: 'Инструменты укрепления (Offline & Online)',
                content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-gray-800/40 p-6 rounded-2xl border-t-4 border-indigo-500">
                            <h4 className="font-bold text-white mb-4 flex items-center gap-2"><TargetIcon /> Offline Стратегия</h4>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex gap-2"><span>📦</span> Увеличение ассортимента (сухие + влажные рационы).</li>
                                <li className="flex gap-2"><span>📈</span> Расширение АКБ (Активной Клиентской Базы).</li>
                                <li className="flex gap-2"><span>📏</span> Увеличение "средней линии" (SKU на полке).</li>
                                <li className="flex gap-2"><span>🏪</span> Фирменное торговое оборудование (дисплеи, стойки).</li>
                                <li className="flex gap-2"><span>👁️</span> Увеличение полочного пространства (Share of Shelf).</li>
                                <li className="flex gap-2"><span>🗣️</span> Выстраивание рекомендаций (продавцы).</li>
                            </ul>
                        </div>
                        <div className="bg-gray-800/40 p-6 rounded-2xl border-t-4 border-emerald-500">
                            <h4 className="font-bold text-white mb-4 flex items-center gap-2"><BrainIcon /> Online Стратегия (AI Trends)</h4>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex gap-2"><span>⭐</span> Управление репутацией (SERM, отзывы).</li>
                                <li className="flex gap-2"><span>🖼️</span> Rich-контент в карточках товаров.</li>
                                <li className="flex gap-2"><span>🎯</span> Перфоманс-маркетинг и ретаргетинг.</li>
                                <li className="flex gap-2"><span>🤳</span> Работа с инфлюенсерами (Pet-блогеры).</li>
                            </ul>
                        </div>
                    </div>
                )
            },
            {
                id: '4-5', title: 'Вектор развития 2026',
                content: (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
                        <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-8 rounded-3xl border border-white/10 shadow-2xl max-w-3xl">
                            <h3 className="text-3xl font-black text-white mb-4">Гармония Каналов</h3>
                            <p className="text-xl text-indigo-200 font-medium">
                                Основной принцип 2026: Соответствие структуры продаж компании реальной структуре рынка.
                            </p>
                            <div className="h-1 w-24 bg-white/20 mx-auto my-6"></div>
                            <p className="text-sm text-gray-400">
                                Мы должны быть там, где наш покупатель. Если рынок уходит в онлайн — мы должны быть лидерами в онлайне. Если растет FMCG — мы ставим туда свой продукт.
                            </p>
                        </div>
                        <div className="text-gray-500 text-xs italic mt-4">
                            Более детальную информацию по развитию каждого канала представят руководители направлений.
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
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>
                
                {/* Slide Title */}
                <div className="mb-6 md:mb-10 flex flex-col md:flex-row justify-between items-start gap-4">
                    <div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                            Блок {activeBlock}: {blocks.find(b => b.id === activeBlock)?.title}
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
                Commercial Insight Presentation • Limkorm Group Strategy 2025-2026
            </div>
        </div>
    );
};

export default Presentation;
