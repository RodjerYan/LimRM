
import React from "react";

function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div className={`shimmer rounded-2xl bg-slate-200/70 ${className}`} />
  );
}

export default function SkeletonGrid({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: tiles }).map((_, i) => (
        <div
          key={i}
          className="rounded-3xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
        >
          <div className="animate-pulse space-y-3">
            <SkeletonBox className="h-3 w-24" />
            <SkeletonBox className="h-8 w-32" />
            <SkeletonBox className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
