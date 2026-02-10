
import React from "react";

export default function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-44 rounded-xl bg-slate-200/80" />
        <div className="h-3 w-72 rounded-xl bg-slate-200/70" />
        <div className="h-3 w-64 rounded-xl bg-slate-200/70" />
        {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
          <div key={i} className="h-3 w-full rounded-xl bg-slate-200/60" />
        ))}
        <div className="h-9 w-36 rounded-2xl bg-slate-200/80 mt-4" />
      </div>
    </div>
  );
}
