
import React, { useState, useEffect } from 'react';
import { Pie, Bar } from 'react-chartjs-2';
import { BrainIcon, LoaderIcon, FactIcon, TargetIcon, TrendingUpIcon, UsersIcon, ChannelIcon } from '../icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const PROXY_URL = '/api/gemini-proxy';

interface SlideProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const Slide: React.FC<SlideProps> = ({ title, subtitle, children }) => (
  <div className="h-full flex flex-col animate-fade-in py-2">
    <div className="mb-6 border-l-4 border-indigo-500 pl-6 flex-shrink-0">
      <h2 className="text-3xl font-bold text-white tracking-tight leading-none mb-2">{title}</h2>
      {subtitle && <p className="text-lg text-gray-400 font-medium">{subtitle}</p>}
    </div>
    <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
      {children}
    </div>
  </div>
);

const AIComparativeAnalysis: React.FC<{ prompt: string; title: string }> = ({ prompt, title }) => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchAI = async () => {
      try {
        const res = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        if (isMounted) setContent(data.text || '');
      } catch (e) {
        if (isMounted) setContent('Аналитика временно недоступна.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchAI();
    return () => { isMounted = false; };
  }, [prompt]);

  const sanitized = DOMPurify.sanitize(marked.parse(content) as string);

  return (
    <div className="bg-indigo-900/10 border border-indigo-500/20 p-5 rounded-2xl h-full flex flex-col">
      <h4 className="font-bold text-indigo-400 uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
        <BrainIcon small /> {title}
      </h4>
      {isLoading && !content ? (
        <div className="flex-grow flex flex-col items-center justify-center gap-3">
          <LoaderIcon className="w-6 h-6 text-indigo-500" />
          <span className="text-gray-500 text-xs animate-pulse">Генерация инсайтов...</span>
        </div>
      ) : (
        <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed text-xs md:text-sm" dangerouslySetInnerHTML={{ __html: sanitized }} />
      )}
    </div>
  );
};

const ReportPresentation: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    // --- БЛОК 1: Зообизнес ---
    <Slide title="Блок 1. Зообизнес" subtitle="Слайд 1: Что такое зообизнес">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full items-center">
        <div className="space-y-6">
          <p className="text-xl text-gray-300 leading-relaxed">
            Зообизнес сегодня — это индустрия <span className="text-indigo-400 font-bold">эмоциональной привязанности</span>. 
            Это не просто производство кормов, а обеспечение качества жизни полноценного члена семьи.
          </p>
          <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700">
            <h4 className="font-bold text-white mb-4">Ключевые столпы:</h4>
            <ul className="space-y-3 text-gray-400">
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> <span>Питание и Нутрициология</span></li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-blue-500"></div> <span>Ветеринария и Уход</span></li>
              <li className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-purple-500"></div> <span>Сервис и Лайфстайл</span></li>
            </ul>
          </div>
        </div>
        <div className="flex justify-center">
            <div className="relative w-64 h-64">
                <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"></div>
                <div className="relative z-10 bg-gray-900 border border-gray-700 rounded-full w-full h-full flex items-center justify-center p-8 text-center">
                    <p className="text-2xl font-bold text-white">Pet <br/>Humanization</p>
                </div>
            </div>
        </div>
      </div>
    </Slide>,

    <Slide title="Этапы развития зообизнеса" subtitle="Слайд 2: Эволюция рынка">
      <div className="relative h-full flex items-center">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-800 transform -translate-y-1/2"></div>
        <div className="grid grid-cols-4 gap-6 relative z-10 w-full">
          {[
            { period: '2000-2010', name: 'Базовый', desc: 'Переход со стола на сухой корм. Формирование культуры.' },
            { period: '2010-2020', name: 'Премиумизация', desc: 'Рост сегментов Премиум/Холистик. Вет. диеты.' },
            { period: '2020-2024', name: 'Омниканальность', desc: 'Бум маркетплейсов. Импортозамещение.' },
            { period: '2025+', name: 'Экосистемы', desc: 'Персонализация. IT-интеграция. Сервис 360°.' },
          ].map((item, idx) => (
            <div key={idx} className="bg-gray-900 border border-gray-700 p-5 rounded-2xl hover:border-indigo-500 transition-all hover:-translate-y-2">
              <div className="text-indigo-400 font-bold font-mono text-sm mb-2">{item.period}</div>
              <h4 className="text-lg font-bold text-white mb-2">{item.name}</h4>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Slide>,

    <Slide title="Вектор развития 5-10 лет" subtitle="Слайд 3: Трансформация">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
        <AIComparativeAnalysis 
          title="AI Футурология: Зоорынок 2030"
          prompt="Опиши зообизнес через 5-10 лет. Тренды: биотехнологии в кормах, персонализированная генетика, IoT для питомцев. Как изменится роль производителя кормов?"
        />
        <div className="space-y-4">
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                <h4 className="text-white font-bold mb-1">Глобальная персонализация</h4>
                <p className="text-sm text-gray-400">Корм как лекарство, подобранное по ДНК.</p>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                <h4 className="text-white font-bold mb-1">Устойчивое развитие</h4>
                <p className="text-sm text-gray-400">Альтернативные протеины (насекомые, растительные).</p>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                <h4 className="text-white font-bold mb-1">Сервисная модель</h4>
                <p className="text-sm text-gray-400">Производитель продает не корм, а "здоровье по подписке".</p>
            </div>
        </div>
      </div>
    </Slide>,

    <Slide title="Основные тренды" subtitle="Слайд 4: Тренды современного зообизнеса">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-full">
            {[
                { title: 'Локализация', icon: '🏭', desc: 'Рост доверия к российскому производству.' },
                { title: 'E-com First', icon: '🛒', desc: 'Маркетплейсы как основной канал продаж.' },
                { title: 'Прозрачность', icon: '🔍', desc: 'Чистый состав, честная этикетка.' },
                { title: 'Эмпатия', icon: '❤️', desc: 'Бренд должен разделять ценности владельца.' },
            ].map((t, i) => (
                <div key={i} className="bg-gray-900/50 border border-gray-700 p-6 rounded-2xl flex flex-col items-center text-center justify-center">
                    <div className="text-4xl mb-4">{t.icon}</div>
                    <h3 className="text-xl font-bold text-white mb-2">{t.title}</h3>
                    <p className="text-sm text-gray-400">{t.desc}</p>
                </div>
            ))}
        </div>
    </Slide>,

    <Slide title="Лимкорм Групп в России" subtitle="Слайд 5: Позиция на рынке">
      <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
        <div className="relative">
            <div className="absolute -inset-4 bg-indigo-500/20 blur-3xl rounded-full"></div>
            <h3 className="text-8xl font-black text-white relative z-10">№1</h3>
        </div>
        <p className="text-2xl text-gray-300 font-medium max-w-3xl">
            Крупнейший независимый производитель кормов для домашних животных в РФ
        </p>
        <div className="grid grid-cols-3 gap-8 w-full max-w-4xl">
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <div className="text-3xl font-bold text-emerald-400 mb-1">Лидер</div>
                <div className="text-xs text-gray-500 uppercase">По мощностям</div>
            </div>
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <div className="text-3xl font-bold text-indigo-400 mb-1">Эксперт</div>
                <div className="text-xs text-gray-500 uppercase">В рецептурах</div>
            </div>
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <div className="text-3xl font-bold text-amber-400 mb-1">Партнер</div>
                <div className="text-xs text-gray-500 uppercase">Для дистрибьюторов</div>
            </div>
        </div>
      </div>
    </Slide>,

    // --- БЛОК 2: Компания глазами партнеров ---
    <Slide title="Блок 2. Компания" subtitle="Слайд 1: Направления деятельности">
        <div className="flex items-center justify-center h-full gap-10">
            <div className="w-1/2 max-w-md">
                <Pie data={{
                    labels: ['НТМ (Наши Торговые Марки)', 'СТМ (Контрактное пр-во)', 'Рыбные корма'],
                    datasets: [{
                        data: [60, 30, 10],
                        backgroundColor: ['#818cf8', '#34d399', '#fbbf24'],
                        borderWidth: 0
                    }]
                }} options={{ plugins: { legend: { position: 'right', labels: { color: '#fff', font: { size: 14 } } } } } }} />
            </div>
            <div className="w-1/2 space-y-4">
                <div className="p-4 border-l-4 border-indigo-500 bg-gray-800/30">
                    <h4 className="text-lg font-bold text-indigo-400">НТМ (60%)</h4>
                    <p className="text-sm text-gray-400">Основной драйвер маржинальности и бренда.</p>
                </div>
                <div className="p-4 border-l-4 border-emerald-500 bg-gray-800/30">
                    <h4 className="text-lg font-bold text-emerald-400">СТМ (30%)</h4>
                    <p className="text-sm text-gray-400">Загрузка мощностей и партнерство с сетями.</p>
                </div>
                <div className="p-4 border-l-4 border-amber-500 bg-gray-800/30">
                    <h4 className="text-lg font-bold text-amber-400">Рыба (10%)</h4>
                    <p className="text-sm text-gray-400">Перспективная ниша аквакультуры.</p>
                </div>
            </div>
        </div>
    </Slide>,

    <Slide title="Этапы развития и Сравнение" subtitle="Слайд 2: Лимкорм vs Западные гиганты">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <div className="space-y-2 overflow-y-auto custom-scrollbar pr-2">
                <h4 className="text-white font-bold mb-2">Хронология Лимкорм</h4>
                {[
                    { year: '2015', event: 'Запуск первого завода. Старт производства.' },
                    { year: '2018', event: 'Выход на федеральный уровень. Sirius.' },
                    { year: '2021', event: 'Запуск AJO. Супер-премиум сегмент.' },
                    { year: '2023', event: 'Масштабирование мощностей x2.' },
                    { year: '2025', event: 'Лидерство в импортозамещении.' }
                ].map((e, i) => (
                    <div key={i} className="flex gap-4 items-start">
                        <span className="font-mono text-indigo-400 font-bold">{e.year}</span>
                        <span className="text-sm text-gray-300">{e.event}</span>
                    </div>
                ))}
            </div>
            <AIComparativeAnalysis 
                title="Сравнительный анализ: Limkorm vs Mars/Nestle"
                prompt="Сравни этапы развития Лимкорм и западных корпораций (Mars, Nestle). В чем преимущество Лимкорм в текущих реалиях РФ (скорость, адаптация)? Какие уроки можно извлечь из опыта гигантов?"
            />
        </div>
    </Slide>,

    <Slide title="Экосистема" subtitle="Слайд 3: Глазами компании">
        <div className="flex items-center justify-center h-full">
            <div className="relative w-full max-w-3xl aspect-video bg-gray-900 border border-gray-700 rounded-xl p-8 flex items-center justify-center">
                {/* Visual Representation of Ecosystem */}
                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                    <div className="w-[500px] h-[500px] border border-dashed border-indigo-500 rounded-full animate-spin-slow"></div>
                </div>
                <div className="grid grid-cols-3 gap-8 relative z-10">
                    <div className="text-center p-4 bg-gray-800 rounded-xl border border-gray-600">
                        <div className="text-2xl mb-2">🏭</div>
                        <div className="font-bold text-white">Производство</div>
                    </div>
                    <div className="text-center p-4 bg-gray-800 rounded-xl border border-gray-600">
                        <div className="text-2xl mb-2">🚚</div>
                        <div className="font-bold text-white">Логистика</div>
                    </div>
                    <div className="text-center p-4 bg-gray-800 rounded-xl border border-gray-600">
                        <div className="text-2xl mb-2">🤝</div>
                        <div className="font-bold text-white">Партнеры</div>
                    </div>
                    <div className="col-span-3 text-center p-6 bg-indigo-900/40 rounded-xl border border-indigo-500 shadow-lg scale-110">
                        <div className="text-4xl mb-2">❤️</div>
                        <div className="font-bold text-xl text-white">Счастливый питомец</div>
                        <div className="text-xs text-indigo-300">Центр экосистемы</div>
                    </div>
                    <div className="text-center p-4 bg-gray-800 rounded-xl border border-gray-600">
                        <div className="text-2xl mb-2">🎓</div>
                        <div className="font-bold text-white">Обучение</div>
                    </div>
                    <div className="text-center p-4 bg-gray-800 rounded-xl border border-gray-600">
                        <div className="text-2xl mb-2">💻</div>
                        <div className="font-bold text-white">IT Сервисы</div>
                    </div>
                    <div className="text-center p-4 bg-gray-800 rounded-xl border border-gray-600">
                        <div className="text-2xl mb-2">📣</div>
                        <div className="font-bold text-white">Маркетинг</div>
                    </div>
                </div>
            </div>
        </div>
    </Slide>,

    <Slide title="Современный сервис" subtitle="Слайд 4-6: Для покупателя">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <h4 className="text-lg font-bold text-white mb-4">Что это такое?</h4>
                <ul className="text-sm text-gray-400 space-y-2">
                    <li>• Скорость доставки < 24ч</li>
                    <li>• Персонализированный подбор</li>
                    <li>• Прозрачность состава (QR)</li>
                    <li>• Поддержка 24/7</li>
                </ul>
            </div>
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <h4 className="text-lg font-bold text-white mb-4">Как стать ближе?</h4>
                <ul className="text-sm text-gray-400 space-y-2">
                    <li>• D2C каналы (Direct to Consumer)</li>
                    <li>• Присутствие во всех маркетплейсах</li>
                    <li>• Сообщества владельцев (Community)</li>
                </ul>
            </div>
            <div className="bg-indigo-900/20 p-6 rounded-2xl border border-indigo-500">
                <h4 className="text-lg font-bold text-indigo-300 mb-4">Вызов 2026</h4>
                <p className="text-sm text-white font-medium mb-4">Создать "Бесшовный путь клиента":</p>
                <div className="text-xs text-gray-400">
                    Увидел рекламу -> Получил пробник -> Купил -> Подписался на доставку.
                </div>
            </div>
        </div>
    </Slide>,

    <Slide title="Любовь к продукту" subtitle="Слайд 7: Доверие потребителей">
        <div className="flex flex-col items-center justify-center h-full text-center">
            <h3 className="text-3xl font-bold text-white mb-6">Сделано в России. Сделано с любовью.</h3>
            <p className="text-gray-400 max-w-2xl mb-10">
                Наша миссия на 2026 год — сломать стереотип о том, что импортное лучше. 
                Мы доказываем качество каждой пачкой.
            </p>
            <div className="grid grid-cols-3 gap-8 w-full max-w-3xl">
                <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="text-2xl text-emerald-400 font-bold mb-1">Честность</div>
                    <div className="text-xs text-gray-500">Открытый состав</div>
                </div>
                <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="text-2xl text-red-400 font-bold mb-1">Забота</div>
                    <div className="text-xs text-gray-500">Горячая линия ветеринара</div>
                </div>
                <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="text-2xl text-blue-400 font-bold mb-1">Стабильность</div>
                    <div className="text-xs text-gray-500">Гарантия качества</div>
                </div>
            </div>
        </div>
    </Slide>,

    // --- БЛОК 3: Бренды ---
    <Slide title="Блок 3. Роль брендов" subtitle="Слайд 1-2: Ценность и Портфель">
        <div className="space-y-8">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 rounded-xl border-l-4 border-indigo-500">
                <h4 className="text-xl font-bold text-white mb-2">Бренд — это актив</h4>
                <p className="text-gray-400 text-sm">Это добавленная стоимость, лояльность и защита от ценовых войн.</p>
            </div>
            
            <div>
                <h4 className="text-lg font-bold text-gray-300 mb-4">Портфель Лимкорм Групп</h4>
                <div className="grid grid-cols-5 gap-4">
                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700 hover:border-red-500 transition-colors">
                        <div className="font-bold text-red-400 text-lg">Одно Мясо</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-2">Super Premium</div>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700 hover:border-indigo-500 transition-colors">
                        <div className="font-bold text-indigo-400 text-lg">AJO</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-2">Holistic / Super Premium</div>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700 hover:border-blue-500 transition-colors">
                        <div className="font-bold text-blue-400 text-lg">Sirius</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-2">Premium</div>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700 hover:border-green-500 transition-colors">
                        <div className="font-bold text-green-400 text-lg">Наш Рацион</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-2">Standard / Eco</div>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700 hover:border-yellow-500 transition-colors">
                        <div className="font-bold text-yellow-400 text-lg">Хаппи Лаппи</div>
                        <div className="text-[10px] text-gray-500 uppercase mt-2">FMCG</div>
                    </div>
                </div>
            </div>
        </div>
    </Slide>,

    <Slide title="Диспропорция портфеля" subtitle="Слайд 3: Объем vs Выручка">
        <div className="grid grid-cols-2 gap-10 h-full items-center">
            <div className="flex flex-col items-center">
                <h4 className="text-lg font-bold text-gray-400 mb-6 uppercase tracking-widest">Доля в ОБЪЕМЕ (кг)</h4>
                <div className="w-64 h-64">
                    <Pie data={{
                    labels: ['Наш Рацион', 'Sirius', 'AJO', 'Хаппи Лаппи', 'Одно Мясо'],
                    datasets: [{
                        data: [45, 25, 15, 10, 5],
                        backgroundColor: ['#10b981', '#6366f1', '#818cf8', '#fbbf24', '#f87171'],
                        borderWidth: 0
                    }]
                    }} options={{ plugins: { legend: { display: true, position: 'bottom', labels: { color: '#fff', padding: 20 } } } }} />
                </div>
            </div>
            <div className="flex flex-col items-center">
                <h4 className="text-lg font-bold text-gray-400 mb-6 uppercase tracking-widest">Доля в ВЫРУЧКЕ (₽)</h4>
                <div className="w-64 h-64">
                    <Pie data={{
                    labels: ['AJO', 'Sirius', 'Наш Рацион', 'Одно Мясо', 'Хаппи Лаппи'],
                    datasets: [{
                        data: [35, 30, 15, 12, 8],
                        backgroundColor: ['#818cf8', '#6366f1', '#10b981', '#f87171', '#fbbf24'],
                        borderWidth: 0
                    }]
                    }} options={{ plugins: { legend: { display: true, position: 'bottom', labels: { color: '#fff', padding: 20 } } } }} />
                </div>
            </div>
        </div>
    </Slide>,

    <Slide title="Стратегия по брендам" subtitle="Слайд 4: Фокусные задачи">
        <div className="grid grid-cols-1 gap-4 h-full overflow-y-auto custom-scrollbar pr-2">
            {[
                { name: 'Одно Мясо, AJO, Sirius', goal: 'Увеличение объемов', desc: 'Кратно увеличить доходность компании (высокая маржа).' },
                { name: 'AJO, Sirius', goal: 'Укрепление позиций', desc: 'Лояльность, признание, любовь к продукту.' },
                { name: 'Одно Мясо', goal: 'Сегмент "Люкс"', desc: 'Изменить отношение к российскому производителю в высоком сегменте.' },
                { name: 'Наш Рацион', goal: 'Стабильность Эконом', desc: 'Воспитание понимания "Цена-Качество". Эконом ≠ Плохо.' },
                { name: 'Хаппи Лаппи', goal: 'Захват FMCG', desc: 'Эффективное развитие в канале ритейла.' }
            ].map((item, i) => (
                <div key={i} className="bg-gray-800/40 border border-gray-700 p-4 rounded-xl flex justify-between items-center hover:bg-gray-800 transition-colors">
                    <div className="w-1/3 font-bold text-indigo-300">{item.name}</div>
                    <div className="w-1/3 font-bold text-white">{item.goal}</div>
                    <div className="w-1/3 text-xs text-gray-400">{item.desc}</div>
                </div>
            ))}
        </div>
    </Slide>,

    // --- БЛОК 4: Каналы сбыта ---
    <Slide title="Блок 4. Каналы сбыта" subtitle="Слайд 1: Классификация">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-full">
            {['Зоосети (Нац/Локал)', 'Зоорозница', 'Вет. канал', 'Бридеры (Заводчики)', 'Тендеры', 'Интернет-канал', 'FMCG'].map((ch, i) => (
                <div key={i} className="bg-gray-900 border border-gray-700 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                    <div className="text-2xl mb-2 text-emerald-400"><ChannelIcon /></div>
                    <div className="font-bold text-gray-200 text-sm">{ch}</div>
                </div>
            ))}
        </div>
    </Slide>,

    <Slide title="Доли каналов: Тренды" subtitle="Слайд 2: Сейчас vs 5-10 лет">
        <div className="h-full flex flex-col gap-6">
            <div className="flex-grow">
                <Bar data={{
                    labels: ['Интернет', 'Зоосети', 'FMCG', 'Розница', 'Вет/Бридер'],
                    datasets: [
                        { label: 'Сейчас', data: [25, 30, 15, 20, 10], backgroundColor: '#6366f1' },
                        { label: 'Через 5 лет', data: [45, 25, 20, 5, 5], backgroundColor: '#10b981' }
                    ]
                }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } }} />
            </div>
            <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-sm text-gray-300 text-center">
                Тенденция очевидна: <span className="text-emerald-400 font-bold">E-commerce и Маркетплейсы</span> заберут до 50% рынка, вытесняя традиционную розницу.
            </div>
        </div>
    </Slide>,

    <Slide title="Инструменты роста" subtitle="Слайд 4: Укрепление позиций">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
            <div className="space-y-4">
                <h4 className="text-lg font-bold text-white">Оффлайн каналы:</h4>
                <ul className="space-y-3">
                    <li className="p-3 bg-gray-800 rounded-lg border border-gray-700 flex items-center gap-3"><span className="text-green-400">✔</span> Увеличение АКБ и средней линии</li>
                    <li className="p-3 bg-gray-800 rounded-lg border border-gray-700 flex items-center gap-3"><span className="text-green-400">✔</span> Фирменное оборудование</li>
                    <li className="p-3 bg-gray-800 rounded-lg border border-gray-700 flex items-center gap-3"><span className="text-green-400">✔</span> Расширение полочного пространства</li>
                    <li className="p-3 bg-gray-800 rounded-lg border border-gray-700 flex items-center gap-3"><span className="text-green-400">✔</span> Обучение продавцов (Рекомендации)</li>
                </ul>
            </div>
            <AIComparativeAnalysis 
                title="AI: Тренды трейд-маркетинга"
                prompt="Какие современные инструменты трейд-маркетинга в зообизнесе будут эффективны в 2026 году? (Digital-витрины, программы лояльности, геймификация для продавцов)."
            />
        </div>
    </Slide>,

    <Slide title="Вектор 2026" subtitle="Слайд 5: Итоги стратегии">
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
            <div className="p-8 bg-indigo-900/30 border border-indigo-500 rounded-3xl max-w-4xl shadow-2xl">
                <h3 className="text-3xl font-bold text-white mb-4">Принцип соответствия</h3>
                <p className="text-xl text-gray-300">
                    Структура продаж внутри компании должна зеркально отражать (или опережать) структуру рынка.
                </p>
                <div className="mt-8 flex justify-center gap-4">
                    <span className="px-4 py-2 bg-indigo-600 rounded-full text-white font-bold">Рынок растет в онлайн</span>
                    <span className="px-4 py-2 bg-gray-700 text-gray-400">-></span>
                    <span className="px-4 py-2 bg-emerald-600 rounded-full text-white font-bold">Мы растем в онлайн</span>
                </div>
            </div>
            <p className="text-gray-500 text-sm">Более детальную информацию по каналам представят руководители направлений.</p>
        </div>
    </Slide>
  ];

  return (
    <div className="relative bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-[2rem] h-[85vh] flex flex-col overflow-hidden shadow-2xl">
      {/* Background Decor */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Progress Top Bar */}
      <div className="h-1.5 w-full bg-gray-800 flex-shrink-0">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-500 ease-out" 
          style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
        ></div>
      </div>

      <div className="flex-grow p-8 md:p-12 relative overflow-hidden flex flex-col">
        {slides[currentSlide]}
      </div>

      {/* Controls */}
      <div className="p-6 border-t border-gray-800 flex justify-between items-center bg-gray-900/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-6">
            <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Слайд</span>
                <span className="text-lg font-mono text-white font-bold">{String(currentSlide + 1).padStart(2, '0')} <span className="text-gray-600">/ {slides.length}</span></span>
            </div>
            <div className="hidden md:block h-8 w-px bg-gray-700"></div>
            <div className="hidden md:block text-[10px] text-gray-500 uppercase font-bold tracking-widest max-w-[150px]">
                Отчетная презентация 2025
            </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
            disabled={currentSlide === 0}
            className="h-12 w-12 rounded-xl bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center border border-gray-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed group shadow-sm"
          >
            <svg className="w-5 h-5 group-active:scale-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <button 
            onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))}
            disabled={currentSlide === slides.length - 1}
            className="h-12 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 transition-all border border-indigo-500 shadow-lg shadow-indigo-900/30 group disabled:opacity-30 disabled:shadow-none"
          >
            <span>{currentSlide === slides.length - 1 ? 'Финиш' : 'Далее'}</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportPresentation;
