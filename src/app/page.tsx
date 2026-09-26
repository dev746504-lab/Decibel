"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDecibelMeter } from "@/hooks/useDecibelMeter";
import Gauge from "@/components/Gauge";
import LiveChart from "@/components/LiveChart";
import StatsPanel from "@/components/StatsPanel";
import CalibrationPanel from "@/components/CalibrationPanel";
import { playAlertSound, disposeAlertContext } from "@/lib/alertSound";

const ALERT_THRESHOLD_KEY = "deciben:alertThreshold";
const ALERT_ENABLED_KEY = "deciben:alertEnabled";
const DEFAULT_THRESHOLD = 70;
const ALERT_COOLDOWN_MS = 3000;

function readStored<T>(key: string, fallback: T, parse: (v: string) => T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try { return parse(raw); } catch { return fallback; }
}

export default function Home() {
  const meter = useDecibelMeter();
  const { status, errorMessage } = meter;

  const [alertEnabled, setAlertEnabled] = useState(() =>
    readStored(ALERT_ENABLED_KEY, false, (v) => v === "true"),
  );
  const [alertThreshold, setAlertThreshold] = useState(() =>
    readStored(ALERT_THRESHOLD_KEY, DEFAULT_THRESHOLD, Number),
  );
  const lastAlertRef = useRef(0);
  const gaugeRef = useRef<HTMLDivElement>(null);

  const hasSessionData = meter.stats.elapsedMs > 0;
  const isMeasuring = status === "measuring";
  const isRequesting = status === "requesting-permission";
  const showMeterUI = isMeasuring || status === "stopped";
  const canStart = !isMeasuring && !isRequesting;

  // Alert: play sound + flash gauge border via DOM class (no setState needed)
  useEffect(() => {
    if (!alertEnabled || !isMeasuring || meter.currentDb === null) return;
    if (meter.currentDb < alertThreshold) return;

    const now = Date.now();
    if (now - lastAlertRef.current < ALERT_COOLDOWN_MS) return;
    lastAlertRef.current = now;

    playAlertSound();
    const el = gaugeRef.current;
    if (el) {
      el.setAttribute("data-alert", "");
      const timer = setTimeout(() => el.removeAttribute("data-alert"), 800);
      return () => {
        clearTimeout(timer);
        el.removeAttribute("data-alert");
      };
    }
  }, [alertEnabled, alertThreshold, isMeasuring, meter.currentDb]);

  const handleAlertEnabledChange = useCallback((enabled: boolean) => {
    setAlertEnabled(enabled);
    localStorage.setItem(ALERT_ENABLED_KEY, String(enabled));
  }, []);

  const handleThresholdChange = useCallback((value: number) => {
    const clamped = Math.min(120, Math.max(30, value));
    setAlertThreshold(clamped);
    localStorage.setItem(ALERT_THRESHOLD_KEY, String(clamped));
  }, []);

  useEffect(() => {
    return () => { disposeAlertContext(); };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6 sm:py-10">
      <header className="text-center">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Đo độ ồn</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Dùng micro của trình duyệt — dữ liệu chỉ xử lý trên máy của bạn.</p>
      </header>

      {(status === "unsupported" || status === "permission-denied" || status === "error") && errorMessage && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
          {errorMessage}
        </div>
      )}

      {!showMeterUI && (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/60 p-6 text-center shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800/60 dark:ring-white/10">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Bấm &quot;Bắt đầu đo&quot; và cho phép trình duyệt truy cập micro. Giữ điện thoại hướng về nguồn âm thanh để có kết quả ổn định hơn.
          </p>
          <button
            type="button"
            onClick={() => meter.start()}
            disabled={!canStart}
            className="w-full rounded-full bg-sky-500 px-6 py-3 text-base font-semibold text-white shadow transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRequesting ? "Đang xin quyền micro..." : "Bắt đầu đo"}
          </button>
        </div>
      )}

      {showMeterUI && (
        <>
          <div
            ref={gaugeRef}
            className="gauge-container rounded-2xl bg-white/60 py-4 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800/60 dark:ring-white/10 transition-shadow"
          >
            <Gauge value={meter.currentDb} />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (isMeasuring ? meter.stop() : meter.start())}
              className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold text-white shadow transition ${
                isMeasuring ? "bg-red-500 hover:bg-red-600" : "bg-sky-500 hover:bg-sky-600"
              }`}
            >
              {isMeasuring ? "Dừng" : "Bắt đầu đo"}
            </button>
            <button
              type="button"
              onClick={() => meter.exportCsv()}
              disabled={!hasSessionData}
              className="rounded-full bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 shadow transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Xuất CSV
            </button>
          </div>

          <div className="rounded-2xl bg-white/60 p-3 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800/60 dark:ring-white/10">
            <LiveChart history={meter.chartHistory} />
          </div>

          <StatsPanel stats={meter.stats} onReset={meter.reset} />
        </>
      )}

      {/* Alert settings */}
      <div className="w-full rounded-2xl bg-white/60 p-4 shadow-sm ring-1 ring-slate-900/5 backdrop-blur dark:bg-slate-800/60 dark:ring-white/10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cảnh báo tiếng ồn</span>
          <button
            type="button"
            onClick={() => handleAlertEnabledChange(!alertEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              alertEnabled ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"
            }`}
            role="switch"
            aria-checked={alertEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                alertEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {alertEnabled && (
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="threshold-input" className="text-sm text-slate-600 dark:text-slate-300">
              Ngưỡng:
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleThresholdChange(alertThreshold - 5)}
                className="h-7 w-7 rounded-full bg-slate-200 text-sm leading-none text-slate-700 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                −
              </button>
              <input
                id="threshold-input"
                type="number"
                inputMode="numeric"
                value={alertThreshold}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) handleThresholdChange(v);
                }}
                className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-sm tabular-nums text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => handleThresholdChange(alertThreshold + 5)}
                className="h-7 w-7 rounded-full bg-slate-200 text-sm leading-none text-slate-700 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                +
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400">dB</span>
            </div>
            <button
              type="button"
              onClick={() => playAlertSound()}
              className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-300 transition hover:bg-slate-100 dark:text-slate-400 dark:ring-slate-600 dark:hover:bg-slate-700"
            >
              Thử
            </button>
          </div>
        )}
        {alertEnabled && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Phát âm thanh cảnh báo khi mức ồn vượt ngưỡng. Nghỉ {ALERT_COOLDOWN_MS / 1000}s giữa các lần phát.
          </p>
        )}
      </div>

      <CalibrationPanel
        offsetDb={meter.offsetDb}
        onOffsetChange={meter.setOffsetDb}
        weighting={meter.weighting}
        onWeightingChange={meter.setWeighting}
        timeWeighting={meter.timeWeighting}
        onTimeWeightingChange={meter.setTimeWeighting}
        usingWorklet={meter.usingWorklet}
        isMeasuring={isMeasuring}
      />

      <footer className="mt-auto pt-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
        Micro chỉ hoạt động trên kết nối HTTPS hoặc localhost.
      </footer>
    </div>
  );
}
