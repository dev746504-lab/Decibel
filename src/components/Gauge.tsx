"use client";

import { GAUGE_MAX_DB, GAUGE_MIN_DB, NOISE_ZONES, clampToGaugeRange, getNoiseZone } from "@/lib/dbScale";

interface GaugeProps {
  value: number | null;
}

const CX = 140;
const CY = 140;
const RADIUS = 116;
const STROKE_WIDTH = 22;
const NEEDLE_LENGTH = RADIUS - STROKE_WIDTH / 2 - 4;

function valueToAngleDeg(value: number): number {
  const clamped = clampToGaugeRange(value);
  const ratio = (clamped - GAUGE_MIN_DB) / (GAUGE_MAX_DB - GAUGE_MIN_DB);
  return 180 - ratio * 180;
}

function pointOnArc(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY - radius * Math.sin(rad),
  };
}

function describeArc(startAngle: number, endAngle: number, radius: number): string {
  const start = pointOnArc(startAngle, radius);
  const end = pointOnArc(endAngle, radius);
  const largeArcFlag = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export default function Gauge({ value }: GaugeProps) {
  const hasValue = value !== null && Number.isFinite(value);
  const zone = hasValue ? getNoiseZone(value) : null;
  const needleAngle = hasValue ? valueToAngleDeg(value) : 180;
  const needleTip = pointOnArc(needleAngle, NEEDLE_LENGTH);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 280 170" className="w-full max-w-sm">
        {NOISE_ZONES.map((z) => {
          const zoneMin = Math.max(z.min, GAUGE_MIN_DB);
          const zoneMax = Math.min(z.max, GAUGE_MAX_DB);
          if (zoneMin >= zoneMax) return null;
          const startAngle = valueToAngleDeg(zoneMin);
          const endAngle = valueToAngleDeg(zoneMax);
          return (
            <path
              key={z.id}
              d={describeArc(startAngle, endAngle, RADIUS)}
              stroke={z.color}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              opacity={zone?.id === z.id ? 1 : 0.45}
              strokeLinecap="butt"
            />
          );
        })}

        <line
          x1={CX}
          y1={CY}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={zone?.color ?? "#94a3b8"}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={8} fill={zone?.color ?? "#94a3b8"} />

        <text x={pointOnArc(180, RADIUS + 18).x} y={pointOnArc(180, RADIUS + 18).y} textAnchor="start" className="fill-slate-400 text-[11px]">
          {GAUGE_MIN_DB}
        </text>
        <text x={pointOnArc(0, RADIUS + 18).x} y={pointOnArc(0, RADIUS + 18).y} textAnchor="end" className="fill-slate-400 text-[11px]">
          {GAUGE_MAX_DB}
        </text>
      </svg>

      <div className="-mt-8 flex flex-col items-center text-center">
        <div className="text-6xl font-bold tabular-nums tracking-tight sm:text-7xl" style={{ color: zone?.color ?? undefined }}>
          {hasValue ? value.toFixed(1) : "--"}
        </div>
        <div className="text-sm font-medium text-slate-400">dB</div>
        {zone && (
          <div className="mt-3 space-y-0.5">
            <div className="text-base font-semibold" style={{ color: zone.color }}>
              {zone.label}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{zone.examples}</div>
          </div>
        )}
      </div>
    </div>
  );
}
