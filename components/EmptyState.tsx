
import React from "react";
import { InfoIcon, AlertIcon, SearchIcon, DataIcon, LoaderIcon } from "./icons";

type Tone = "neutral" | "info" | "warn" | "error" | "success";
type Kind = "empty" | "noResults" | "loading" | "blocked";

interface EmptyStateProps {
  title: string;
  description?: string;
  kind?: Kind;
  tone?: Tone;
  action?: React.ReactNode;
  compact?: boolean;
}

const toneStyles: Record<Tone, { ring: string; iconBg: string; iconText: string }> = {
  neutral: { ring: "border-slate-200 bg-slate-50", iconBg: "bg-slate-900/5", iconText: "text-slate-600" },
  info: { ring: "border-indigo-200 bg-indigo-50", iconBg: "bg-indigo-100", iconText: "text-indigo-700" },
  warn: { ring: "border-amber-200 bg-amber-50", iconBg: "bg-amber-100", iconText: "text-amber-700" },
  error: { ring: "border-red-200 bg-red-50", iconBg: "bg-red-100", iconText: "text-red-700" },
  success: { ring: "border-emerald-200 bg-emerald-50", iconBg: "bg-emerald-100", iconText: "text-emerald-700" },
};

function pickIcon(kind: Kind) {
  if (kind === "loading") return <LoaderIcon className="w-5 h-5 animate-spin" />;
  if (kind === "noResults") return <SearchIcon className="w-5 h-5" />;
  if (kind === "blocked") return <AlertIcon className="w-5 h-5" />;
  return <DataIcon className="w-5 h-5" />;
}

export default function EmptyState({
  title,
  description,
  kind = "empty",
  tone = "neutral",
  action,
  compact = false,
}: EmptyStateProps) {
  const t = toneStyles[tone];

  return (
    <div
      className={[
        "relative overflow-hidden rounded-3xl border",
        t.ring,
        "p-6",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
      ].join(" ")}
    >
      {/* premium glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(700px 280px at 20% 10%, rgba(99,102,241,0.10), transparent 60%)," +
            "radial-gradient(700px 280px at 85% 18%, rgba(34,211,238,0.08), transparent 60%)",
        }}
      />

      <div className="relative flex items-start gap-4">
        <div className={`shrink-0 w-12 h-12 rounded-2xl border border-slate-200/70 ${t.iconBg} ${t.iconText} flex items-center justify-center shadow-sm`}>
          {pickIcon(kind)}
        </div>

        <div className="min-w-0 flex-1">
          <div className={`text-base font-black ${compact ? "leading-tight" : ""} text-slate-900`}>
            {title}
          </div>
          {description && (
            <div className="text-sm text-slate-600 mt-1 leading-relaxed">
              {description}
            </div>
          )}

          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}
