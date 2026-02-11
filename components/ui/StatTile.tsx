
import React, { useMemo } from "react";

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

  // Determine if value is numeric or text to adjust sizing/truncation behavior
  const isMostlyNumeric = useMemo(() => {
    const v = (value || "").trim();
    // Allow digits, spaces, dots, commas, plus/minus, %, slashes
    return /^[\d\s.,+-/%]+$/.test(v);
  }, [value]);

  const valueStyle = useMemo<React.CSSProperties>(() => {
    // Reduced sizing to prevent overflow and "shouting" UI
    return {
      fontSize: isMostlyNumeric
        ? "clamp(15px, 1.35vw, 20px)"
        : "clamp(14px, 1.2vw, 18px)",
    };
  }, [isMostlyNumeric]);

  return (
    <div
      className={
        `rounded-3xl border border-slate-200/70 bg-gradient-to-br ${a[accent]} ` +
        "p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] " +
        "hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)] transition-all h-full flex flex-col justify-between min-w-0"
      }
    >
      <div 
        className="text-[10px] uppercase tracking-[0.18em] text-slate-600 font-semibold truncate" 
        title={label}
      >
        {label}
      </div>
      
      <div 
        className={[
          "mt-1 font-semibold text-slate-900 leading-none tracking-tight",
          isMostlyNumeric ? "tabular-nums whitespace-nowrap" : "truncate"
        ].join(" ")}
        style={valueStyle}
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
