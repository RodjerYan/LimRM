
import React from "react";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "rounded-3xl border border-slate-200/70 bg-white/75 backdrop-blur-xl " +
        "shadow-[0_18px_50px_rgba(15,23,42,0.08)] " +
        "hover:shadow-[0_22px_70px_rgba(15,23,42,0.10)] transition-all " +
        className
      }
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
      <div>
        <div className="text-base font-semibold text-slate-900 leading-tight tracking-tight">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-1 font-normal">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={"px-6 pb-6 " + className}>{children}</div>;
}
