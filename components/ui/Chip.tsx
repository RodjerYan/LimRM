
import React from "react";

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "lime" | "blue" | "pink" | "red";
  className?: string;
}) {
  const map: Record<string, string> = {
    neutral: "bg-slate-900/5 text-slate-700 border-slate-200",
    lime: "bg-lime-400/20 text-lime-800 border-lime-300/40",
    blue: "bg-sky-400/20 text-sky-800 border-sky-300/40",
    pink: "bg-fuchsia-400/20 text-fuchsia-800 border-fuchsia-300/40",
    red: "bg-red-400/15 text-red-700 border-red-300/40",
  };

  return (
    <span className={`inline-flex items-center justify-center h-6 rounded-xl border px-2 text-[10px] font-extrabold whitespace-nowrap ${map[tone]} ${className}`}>
      {children}
    </span>
  );
}
