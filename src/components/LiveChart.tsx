"use client";

import { useEffect, useRef } from "react";
import { GAUGE_MAX_DB, GAUGE_MIN_DB, NOISE_ZONES } from "@/lib/dbScale";
import type { ChartPoint } from "@/hooks/useDecibelMeter";

interface LiveChartProps {
  history: ChartPoint[];
}

const WINDOW_MS = 60_000;
const LINE_COLOR = "#0ea5e9";
const GRID_LINES = [50, 70, 85, 100];

export default function LiveChart({ history }: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 8, right: 8, bottom: 18, left: 30 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const dbToY = (db: number) => {
      const clamped = Math.min(GAUGE_MAX_DB, Math.max(GAUGE_MIN_DB, db));
      const ratio = (clamped - GAUGE_MIN_DB) / (GAUGE_MAX_DB - GAUGE_MIN_DB);
      return padding.top + plotH * (1 - ratio);
    };

    for (const zone of NOISE_ZONES) {
      const zoneMin = Math.max(zone.min, GAUGE_MIN_DB);
      const zoneMax = Math.min(zone.max, GAUGE_MAX_DB);
      if (zoneMin >= zoneMax) continue;
      const yTop = dbToY(zoneMax);
      const yBottom = dbToY(zoneMin);
      ctx.fillStyle = zone.colorSoft;
      ctx.fillRect(padding.left, yTop, plotW, yBottom - yTop);
    }

    ctx.strokeStyle = isDark ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.25)";
    ctx.fillStyle = isDark ? "rgba(148,163,184,0.8)" : "rgba(71,85,105,0.8)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    for (const line of GRID_LINES) {
      const y = dbToY(line);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.stroke();
      ctx.fillText(String(line), 2, y + 3);
    }

    if (history.length < 2) return;

    const latestT = history[history.length - 1].t;
    const xMax = latestT;
    const xMin = Math.max(0, xMax - WINDOW_MS);
    const tToX = (t: number) => padding.left + ((t - xMin) / Math.max(1, xMax - xMin)) * plotW;

    ctx.beginPath();
    history.forEach((point, i) => {
      const x = tToX(point.t);
      const y = dbToY(point.db);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    const lastPoint = history[history.length - 1];
    ctx.lineTo(tToX(lastPoint.t), padding.top + plotH);
    ctx.lineTo(tToX(history[0].t), padding.top + plotH);
    ctx.closePath();
    ctx.fillStyle = isDark ? "rgba(14,165,233,0.12)" : "rgba(14,165,233,0.1)";
    ctx.fill();
  }, [history]);

  return (
    <div ref={containerRef} className="h-40 w-full sm:h-48">
      <canvas ref={canvasRef} />
    </div>
  );
}
