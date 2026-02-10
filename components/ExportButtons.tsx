
import React from "react";
import { ExportIcon } from "./icons";

export default function ExportButtons() {
  const fakeExport = (type: string) => {
    alert(`Экспорт в ${type} формируется. Файл будет скачан автоматически.`);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => fakeExport("Excel")}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95"
        title="Скачать данные в формате Excel"
      >
        <ExportIcon small />
        <span>XLSX</span>
      </button>
      <button
        onClick={() => fakeExport("CSV")}
        className="hidden md:flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95"
        title="Скачать данные в формате CSV"
      >
        <span>CSV</span>
      </button>
    </div>
  );
}
