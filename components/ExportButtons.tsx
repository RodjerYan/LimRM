
import React, { useState } from "react";
import { ExportIcon } from "./icons";

export default function ExportButtons() {
  const [open, setOpen] = useState<null | "excel" | "csv">(null);

  return (
    <>
      <div className="flex items-center gap-2" data-tour="export">
        <button
          onClick={() => setOpen("excel")}
          className="flex items-center gap-2 h-9 px-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95 whitespace-nowrap"
          title="Скачать данные в формате Excel"
        >
          <ExportIcon small />
          <span>XLSX</span>
        </button>
        <button
          onClick={() => setOpen("csv")}
          className="hidden md:flex items-center gap-2 h-9 px-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95 whitespace-nowrap"
          title="Скачать данные в формате CSV"
        >
          <span>CSV</span>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[2200]">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-md" onClick={() => setOpen(null)} />
          <div className="relative flex items-center justify-center h-full p-4">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] p-6 animate-fade-up">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <ExportIcon />
                </div>
                <div className="text-lg font-black text-slate-900">Экспорт: {open.toUpperCase()}</div>
              </div>
              <div className="text-sm text-slate-600 mt-2 leading-relaxed">
                Запрос на формирование файла отправлен. Выгрузка начнется автоматически, как только данные будут подготовлены сервером.
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setOpen(null)}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-500 text-white text-sm font-black shadow-[0_14px_40px_rgba(99,102,241,0.22)] hover:from-indigo-500 hover:to-sky-400 transition-all"
                >
                  Понял
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
