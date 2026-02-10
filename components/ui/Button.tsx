
import React from "react";

type Variant = "primary" | "soft" | "ghost" | "danger";

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "rounded-2xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.98] " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const v =
    variant === "primary"
      ? "bg-gradient-to-r from-indigo-600 to-sky-500 text-white " +
        "shadow-[0_14px_40px_rgba(99,102,241,0.22)] hover:from-indigo-500 hover:to-sky-400"
      : variant === "soft"
      ? "bg-slate-900/5 hover:bg-slate-900/7 text-slate-800 border border-slate-200"
      : variant === "danger"
      ? "bg-red-600 hover:bg-red-500 text-white shadow-[0_14px_40px_rgba(239,68,68,0.18)]"
      : "bg-transparent hover:bg-slate-900/5 text-slate-700";

  return (
    <button {...props} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  );
}
