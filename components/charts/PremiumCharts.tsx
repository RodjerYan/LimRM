
import React from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from "recharts";

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/75 backdrop-blur-xl shadow-[0_18px_50px_rgba(15,23,42,0.08)] overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200/70 bg-white/70 flex-shrink-0">
        <div className="text-sm font-black text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
      </div>
      <div className="p-4 flex-grow min-h-[300px]">{children}</div>
    </div>
  );
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];

export function ChannelBarChart({
  data,
  onBarClick,
}: {
  data: Array<{ name: string; count: number; volumeTons: number }>;
  onBarClick?: (name: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis 
            dataKey="name" 
            tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} 
            interval={0} 
            angle={-15} 
            textAnchor="end"
            height={60} 
            tickLine={false}
            axisLine={false}
        />
        <YAxis 
            tick={{ fontSize: 10, fill: '#64748b' }} 
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
        />
        <Tooltip 
            cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: 'bold' }}
        />
        <Bar 
            dataKey="count" 
            radius={[6, 6, 0, 0]} 
            animationDuration={1000}
            onClick={(data) => {
                if (onBarClick && data && data.name) {
                    onBarClick(data.name);
                }
            }}
            style={{ cursor: onBarClick ? 'pointer' : 'default' }}
        >
            {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VolumeLineChart({
  data,
}: {
  data: Array<{ month: string; volumeTons: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis 
            dataKey="month" 
            tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} 
            tickLine={false}
            axisLine={false}
        />
        <YAxis 
            tick={{ fontSize: 10, fill: '#64748b' }} 
            tickLine={false}
            axisLine={false}
        />
        <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: 'bold' }}
        />
        <Line 
            type="monotone" 
            dataKey="volumeTons" 
            stroke="#6366f1" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
            activeDot={{ r: 6, fill: '#4f46e5' }}
            animationDuration={1500}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
