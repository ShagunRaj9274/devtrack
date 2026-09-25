'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { priorityColor, priorityLabel, statusColor, statusLabel, typeLabel } from '@/lib/format';
import type { ProjectAnalytics } from '@/lib/types';

const axis = { fontSize: 11, fill: '#667085' };
const tooltipStyle = { borderRadius: 6, border: '1px solid #e2e5ea', fontSize: 12, boxShadow: 'none' };

export function ChartPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h3 className="font-medium">{title}</h3>
      {description && <p className="text-xs text-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function StatusDonut({ data }: { data: ProjectAnalytics['byStatus'] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={total ? data : [{ status: 'TODO', count: 1 }]} dataKey="count" nameKey="status" innerRadius={46} outerRadius={66} paddingAngle={total ? 2 : 0} stroke="none" isAnimationActive={false}>
              {(total ? data : [{ status: 'TODO' as const, count: 1 }]).map((d) => (
                <Cell key={d.status} fill={total ? statusColor[d.status] : '#eef0f3'} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xl font-semibold">{total}</div>
            <div className="text-[0.6875rem] text-muted">issues</div>
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-[0.8125rem]">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: statusColor[d.status] }} aria-hidden />
            <span className="text-ink-2">{statusLabel[d.status]}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PriorityBarsChart({ data }: { data: ProjectAnalytics['openByPriority'] }) {
  const rows = [...data].reverse().map((d) => ({ ...d, label: priorityLabel[d.priority] }));
  return (
    <div className="h-40">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16 }}>
          <XAxis type="number" allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" tick={axis} axisLine={false} tickLine={false} width={56} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f5f6f8' }} formatter={(v) => [v, 'Open issues']} />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={16} isAnimationActive={false}>
            {rows.map((d) => (
              <Cell key={d.priority} fill={priorityColor[d.priority]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TypeBars({ data }: { data: ProjectAnalytics['byType'] }) {
  const rows = data.map((d) => ({ ...d, label: typeLabel[d.type] }));
  return (
    <div className="h-40">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ right: 8 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={24} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f5f6f8' }} formatter={(v) => [v, 'Issues']} />
          <Bar dataKey="count" fill="#0e7c74" radius={[3, 3, 0, 0]} barSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data }: { data: ProjectAnalytics['trend'] }) {
  const rows = data.map((d) => ({ ...d, label: new Date(d.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) }));
  return (
    <div className="h-48">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ right: 8, top: 4 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={24} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line type="linear" dataKey="created" name="Created" stroke="#1f6fd1" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          <Line type="linear" dataKey="completed" name="Completed" stroke="#2b8a3e" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
