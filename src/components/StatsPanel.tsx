"use client";

import type { MeterStats } from "@/hooks/useDecibelMeter";

interface StatsPanelProps {
  stats: MeterStats;
  onReset: () => void;
}

function formatDb(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "--" : value.toFixed(1);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

const ITEMS: { key: keyof MeterStats; label: string }[] = [
  { key: "min", label: "Min" },
  { key: "avg", label: "Trung bình" },
  { key: "max", label: "Max" },
  { key: "peak", label: "Peak" },
];

export default function StatsPanel({ stats, onReset }: StatsPanelProps) {
  return (
    <div className="w-full rounded-2xl bg-white/60 p-4 shadow-sm ring-1 ring-slate-900/5 backdrop-blur dark:bg-slate-800/60 dark:ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Thời gian đo: <span className="tabular-nums text-slate-700 dark:text-slate-200">{formatDuration(stats.elapsedMs)}</span>
        </span>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-300 transition hover:bg-slate-100 dark:text-slate-400 dark:ring-slate-600 dark:hover:bg-slate-700"
        >
          Reset thống kê
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {ITEMS.map((item) => (
          <div key={item.key} className="rounded-xl bg-white/70 py-2 dark:bg-slate-900/40">
            <div className="text-lg font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatDb(stats[item.key] as number | null)}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Trung bình được tính theo năng lượng âm thanh (Leq), không phải trung bình cộng.</p>
    </div>
  );
}
