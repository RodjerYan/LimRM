
import React, { useState, useEffect, useRef } from 'react';
import { Pie } from 'react-chartjs-2';
import { BrainIcon, LoaderIcon, SuccessIcon, FactIcon, TargetIcon, TrendingUpIcon, DataIcon, ChannelIcon, CoverageIcon, UsersIcon } from '../icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const PROXY_URL = '/api/gemini-proxy';

interface SlideProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const Slide: React.FC<SlideProps> = ({ title, subtitle, children }) => (
  <div className="h-full flex flex-col animate-fade-in py-6">
    <div className="mb-10 border-l-4 border-indigo-500 pl-6">
      <h2 className="text-4xl font-bold text-white tracking-tight leading-none mb-3">{title}</h2>
      {subtitle && <p className="text-xl text-gray-400 font-medium">{subtitle}</p>}
    </div>
    <div className="flex-grow">
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
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader!.read();
          if (done) break;
          const chunk = decoder.decode(value);
          if (isMounted) setContent(prev => prev + chunk);
        }
      } catch (e) {
        if (isMounted) setContent('Ошибка загрузки анализа ИИ. Попробуйте позже.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchAI();
    return () => { isMounted = false; };
  }, [prompt]);

  const sanitized = DOMPurify.sanitize(marked.parse(content) as string);

  return (
    <div className="bg-indigo-900/10 border border-indigo-500/20 p-6 rounded-2xl h-full flex flex-col">
      <h4 className="font-bold text-indigo-400 uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
        <BrainIcon small /> {title}
      </h4>
      {isLoading && !content ? (
        <div className="flex-grow flex flex-col items-center justify-center gap-3">
          <LoaderIcon className="w-8 h-8 text-indigo-500" />
          <span className="text-gray-500 text-sm animate-pulse">ИИ анализирует мировые тренды...</span>
        </div>
      ) : (
        <div className="prose prose-invert prose-sm max-w-none overflow-y-auto custom-scrollbar pr-4 flex-grow" dangerouslySetInnerHTML={{ __html: sanitized }} />
      )}
    </div>
  );
};

const ReportPresentation: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    // BLOCK 1
    <Slide title="Блок 1. Зоо бизнес" subtitle="Что такое современный зообизнес в 2025 году?">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
        <div className="space-y-6">
          <p className="text-2xl text-gray-300 leading-relaxed">
            Зообизнес сегодня — это не просто продажа кормов. Это часть экосистемы 
            <span className="text-indigo-400 font-bold"> Pet-Humanization</span>. 
            Питомцы стали полноправными членами семьи, а их потребности — приоритетом.
          </p>
          <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700">
            <h4 className="font-bold text-white mb-4">Ключевые характеристики:</h4>
            <ul className="space-y-3 text-gray-400">
              <li className="flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Высокая устойчивость к кризисам</li>
              <li className="flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Тренд на премиумизацию</li>
              <li className="flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Рост ветеринарной ответственности</li>
            </ul>
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-2xl border border-gray-800 flex items-center justify-center p-12">
            <div className="text-center">
                <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/40">
                    <UsersIcon className="w-16 h-16 text-indigo-400" />
                </div>
                <h3 className="text-3xl font-bold text-white mb-2">Человекоцентричность</h3>
                <p className="text-gray-500">Основа трансформации рынка</p>
            </div>
        </div>
      </div>
    </Slide>,

    <Slide title="Этапы развития зообизнеса" subtitle="От базовой потребности к стилю жизни">
      <div className="relative h-full py-10">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-800 transform -translate-y-1/2"></div>
        <div className="grid grid-cols-4 gap-4 relative z-10">
          {[
            { year: '2000-2010', title: 'Становление', desc: 'Переход с "домашней еды" на сухие корма. Формирование розницы.' },
            { year: '2010-2020', title: 'Сегментация', desc: 'Появление брендов "Супер-Премиум", развитие ветеринарных диет.' },
            { year: '2020-2024', title: 'Цифровизация', desc: 'Взрывной рост E-com, маркетплейсов и сервисов доставки.' },
            { year: '2025+', title: 'Экосистема', desc: 'Интеграция питания, здоровья, сервисов и гаджетов в одну среду.' },
          ].map((item, idx) => (
            <div key={idx} className="bg-gray-900 border border-gray-700 p-6 rounded-2xl group hover:border-indigo-500 transition-all hover:-translate-y-2">
              <div className="text-indigo-400 font-bold font-mono mb-2">{item.year}</div>
              <h4 className="text-xl font-bold text-white mb-3">{item.title}</h4>
              <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Slide>,

    <Slide title="Зообизнес через 5-10 лет" subtitle="Вектор трансформации и ИИ">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
        <AIComparativeAnalysis 
          title="Прогноз трансформации от ИИ"
          prompt="Опиши будущее зообизнеса в России через 10 лет. Какие технологии (ИИ, биотех, генетика) изменят рынок кормов? Сделай акцент на персонализации рационов."
        />
        <div className="space-y-4">
            <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <h4 className="font-bold text-emerald-400 mb-2">1. Гипер-персонализация</h4>
                <p className="text-sm text-gray-400">Корм, созданный на основе генетического теста питомца и данных его фитнес-трекера.</p>
            </div>
            <div className="p-5 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                <h4 className="font-bold text-purple-400 mb-2">2. Умное Потребление</h4>
                <p className="text-sm text-gray-400">Автоматическая дозаправка кормушек по модели подписки (Subscription-first).</p>
            </div>
            <div className="p-5 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                <h4 className="font-bold text-blue-400 mb-2">3. Эко-Логистика</h4>
                <p className="text-sm text-gray-400">Минимизация углеродного следа и использование альтернативных источников протеина.</p>
            </div>
        </div>
      </div>
    </Slide>,

    <Slide title="Компания Лимкорм Групп" subtitle="Наш статус в зообизнесе России">
      <div className="flex flex-col items-center justify-center h-full text-center space-y-10">
        <div className="relative">
            <div className="absolute -inset-4 bg-indigo-500/20 blur-3xl rounded-full"></div>
            <h3 className="text-7xl font-black text-white relative z-10">№1</h3>
        </div>
        <p className="text-3xl text-gray-300 font-medium max-w-4xl">
            Крупнейший независимый производитель кормов для домашних животных в Российской Федерации
        </p>
        <div className="grid grid-cols-3 gap-12 w-full max-w-5xl">
            <div className="bg-gray-800/40 p-8 rounded-3xl border border-gray-700">
                <div className="text-4xl font-mono font-bold text-emerald-400 mb-2">100+</div>
                <div className="text-sm text-gray-500 uppercase font-bold">Тысяч тонн в год</div>
            </div>
            <div className="bg-gray-800/40 p-8 rounded-3xl border border-gray-700">
                <div className="text-4xl font-mono font-bold text-indigo-400 mb-2">5</div>
                <div className="text-sm text-gray-500 uppercase font-bold">Собственных брендов</div>
            </div>
            <div className="bg-gray-800/40 p-8 rounded-3xl border border-gray-700">
                <div className="text-4xl font-mono font-bold text-amber-400 mb-2">24/7</div>
                <div className="text-sm text-gray-500 uppercase font-bold">Контроль качества</div>
            </div>
        </div>
      </div>
    </Slide>,

    // BLOCK 3 (Brands)
    <Slide title="Портфель Брендов: Объем vs Деньги" subtitle="Диспропорция ценности">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 h-full py-6">
        <div className="flex flex-col items-center">
          <h4 className="text-lg font-bold text-gray-400 mb-6 uppercase tracking-widest">Доля в ОБЪЕМЕ (кг)</h4>
          <div className="w-80 h-80">
            <Pie data={{
              labels: ['AJO', 'Sirius', 'Наш Рацион', 'Хаппи Лаппи', 'Одно Мясо'],
              datasets: [{
                data: [15, 25, 45, 10, 5],
                backgroundColor: ['#818cf8', '#6366f1', '#10b981', '#fbbf24', '#f87171'],
                borderWidth: 0
              }]
            }} options={{ plugins: { legend: { display: true, position: 'bottom', labels: { color: '#fff' } } } }} />
          </div>
          <p className="mt-6 text-sm text-gray-500 text-center max-w-xs italic">
            "Наш Рацион" — фундамент объема. Эконом-сегмент формирует массу.
          </p>
        </div>
        <div className="flex flex-col items-center">
          <h4 className="text-lg font-bold text-gray-400 mb-6 uppercase tracking-widest">Доля в ВЫРУЧКЕ (₽)</h4>
          <div className="w-80 h-80">
             <Pie data={{
              labels: ['AJO', 'Sirius', 'Наш Рацион', 'Хаппи Лаппи', 'Одно Мясо'],
              datasets: [{
                data: [35, 30, 15, 8, 12],
                backgroundColor: ['#818cf8', '#6366f1', '#10b981', '#fbbf24', '#f87171'],
                borderWidth: 0
              }]
            }} options={{ plugins: { legend: { display: true, position: 'bottom', labels: { color: '#fff' } } } }} />
          </div>
          <p className="mt-6 text-sm text-gray-500 text-center max-w-xs italic">
            <span className="text-indigo-400 font-bold">AJO</span> и <span className="text-red-400 font-bold">Одно Мясо</span> — драйверы маржинальности.
          </p>
        </div>
      </div>
    </Slide>,

    <Slide title="Сравнительный анализ: Развитие" subtitle="Limkorm vs Mars & Nestle">
      <AIComparativeAnalysis 
        title="AI Сравнение траекторий развития"
        prompt="Проведи сравнительный анализ стратегии развития компании Лимкорм (Россия) и западных гигантов Mars Petcare / Nestle Purina. В чем Лимкорм опережает их в текущих условиях РФ (гибкость, локализация)? Как ИИ может помочь Лимкорму сократить технологический разрыв?"
      />
    </Slide>,

    <Slide title="Современный Сервис 2026" subtitle="Вызовы и инструменты">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4"><FactIcon className="text-indigo-400" /></div>
          <h4 className="font-bold text-white mb-2">Наличие товара</h4>
          <p className="text-xs text-gray-500">Автоматизация стоков и логистики через нейросети.</p>
        </div>
        <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4"><TargetIcon className="text-emerald-400" /></div>
          <h4 className="font-bold text-white mb-2">Омниканальность</h4>
          <p className="text-xs text-gray-500">Единый опыт покупки: от зоомагазина у дома до маркетплейса.</p>
        </div>
        <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4"><BrainIcon className="text-amber-400" /></div>
          <h4 className="font-bold text-white mb-2">Консультации 24/7</h4>
          <p className="text-xs text-gray-500">AI-ассистенты для подбора рациона конечному покупателю.</p>
        </div>
        <div className="md:col-span-3">
             <AIComparativeAnalysis 
                title="Тренды онлайн-каналов 2026"
                prompt="Напиши 5 главных трендов развития онлайн-продаж (e-commerce) для рынка кормов в 2026 году. Какие инструменты (автозаказ, дополненная реальность, чат-боты) будут критичны для успеха бренда?"
             />
        </div>
      </div>
    </Slide>,

    <Slide title="Заключение: Вектор 2026" subtitle="Бренды как активы компании">
      <div className="flex flex-col items-center justify-center h-full space-y-12">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-10 rounded-[3rem] shadow-2xl shadow-indigo-500/20 max-w-4xl text-center border border-white/10">
          <h3 className="text-4xl font-bold text-white mb-6 italic">"Бренды — это не логотипы. Бренды — это доверие, конвертированное в капитализацию."</h3>
          <div className="flex justify-center gap-8">
            <div className="text-white">
                <div className="text-2xl font-bold">+25%</div>
                <div className="text-[10px] uppercase opacity-60">Цель по выручке</div>
            </div>
            <div className="w-px h-10 bg-white/20"></div>
            <div className="text-white">
                <div className="text-2xl font-bold">100%</div>
                <div className="text-[10px] uppercase opacity-60">Доверие покупателей</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4">
            {['AJO', 'Sirius', 'Одно Мясо', 'Наш Рацион', 'Хаппи Лаппи'].map(b => (
                <div key={b} className="bg-gray-800 px-6 py-3 rounded-xl border border-gray-700 text-gray-300 font-bold text-center hover:bg-gray-700 transition-colors">
                    {b}
                </div>
            ))}
        </div>
      </div>
    </Slide>
  ];

  return (
    <div className="relative bg-black/40 backdrop-blur-md border border-white/10 rounded-[2rem] h-[85vh] flex flex-col overflow-hidden shadow-3xl">
      {/* Background Decor */}
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Progress Top Bar */}
      <div className="h-1.5 w-full bg-gray-900 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-700 ease-out" 
          style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
        ></div>
      </div>

      <div className="flex-grow p-12 relative overflow-y-auto custom-scrollbar">
        {slides[currentSlide]}
      </div>

      {/* Controls */}
      <div className="p-8 border-t border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur-xl">
        <div className="flex items-center gap-6">
            <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Слайд</span>
                <span className="text-xl font-mono text-white font-bold">{String(currentSlide + 1).padStart(2, '0')} <span className="text-gray-600">/ {slides.length}</span></span>
            </div>
            <div className="h-10 w-px bg-gray-800"></div>
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest max-w-[120px]">
                Итоговый Отчет 2025: Лимкорм Групп
            </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
            disabled={currentSlide === 0}
            className="w-14 h-14 rounded-2xl bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center border border-gray-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
          >
            <svg className="w-6 h-6 group-active:scale-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <button 
            onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))}
            disabled={currentSlide === slides.length - 1}
            className="px-10 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-3 transition-all border border-indigo-500 shadow-xl shadow-indigo-900/30 group disabled:opacity-30"
          >
            <span>{currentSlide === slides.length - 1 ? 'Конец' : 'Вперед'}</span>
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportPresentation;
