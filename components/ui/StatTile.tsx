
import React from "react";

export function StatTile({
  label,
  value,
  accent = "lime",
  footnote,
}: {
  label: string;
  value: string;
  accent?: "lime" | "blue" | "pink" | "neutral";
  footnote?: string;
}) {
  const a: Record<string, string> = {
    lime: "from-lime-400/35 via-white/60 to-white/75",
    blue: "from-sky-400/35 via-white/60 to-white/75",
    pink: "from-fuchsia-400/30 via-white/60 to-white/75",
    neutral: "from-slate-900/8 via-white/70 to-white/80",
  };

  return (
    <div
      className={
        `rounded-3xl border border-slate-200/70 bg-gradient-to-br ${a[accent]} ` +
        "p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] " +
        "hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)] transition-all h-full flex flex-col justify-between"
      }
    >
      <div 
        className="text-[10px] uppercase tracking-[0.18em] text-slate-600 font-bold truncate" 
        title={label}
      >
        {label}
      </div>
      
      {/* Smart typography: clamps size between 20px and 28px depending on viewport, prevents overflow */}
      <div 
        className="mt-1 font-semibold text-slate-900 tabular-nums leading-none tracking-tight truncate"
        style={{ fontSize: "clamp(20px, 2.2vw, 28px)" }}
        title={value}
      >
        {value}
      </div>
      
      {footnote && (
        <div className="mt-2 text-[10px] text-slate-500 font-medium truncate opacity-80">
          {footnote}
        </div>
      )}
    </div>
  );
}
