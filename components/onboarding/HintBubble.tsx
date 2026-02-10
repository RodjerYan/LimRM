
import React from "react";

export default function HintBubble({
  title,
  text,
  onNext,
  onSkip,
  step,
  total,
}: {
  title: string;
  text: string;
  onNext: () => void;
  onSkip: () => void;
  step: number;
  total: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] p-5 w-[360px] animate-fade-up z-[3000] relative">
      <div className="text-[11px] uppercase tracking-widest text-slate-500 font-black">
        Подсказка {step}/{total}
      </div>
      <div className="mt-2 text-base font-black text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600 leading-relaxed">{text}</div>
      <div className="mt-4 flex items-center justify-between">
        <button onClick={onSkip} className="px-4 py-2 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-700 hover:bg-slate-100 transition-colors">
          Пропустить
        </button>
        <button onClick={onNext} className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-500 text-white text-sm font-black shadow-[0_14px_40px_rgba(99,102,241,0.22)] hover:from-indigo-500 hover:to-sky-400 transition-all">
          Далее
        </button>
      </div>
      {/* Arrow */}
      <div className="absolute w-4 h-4 bg-white border-l border-t border-slate-200 transform -rotate-45 -bottom-2 left-8 shadow-[-2px_-2px_5px_rgba(0,0,0,0.03)]"></div>
    </div>
  );
}
