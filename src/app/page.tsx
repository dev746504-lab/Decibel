"use client";

import { useDecibelMeter } from "@/hooks/useDecibelMeter";
import Gauge from "@/components/Gauge";
import LiveChart from "@/components/LiveChart";
import StatsPanel from "@/components/StatsPanel";
import CalibrationPanel from "@/components/CalibrationPanel";

export default function Home() {
  const meter = useDecibelMeter();
  const { status, errorMessage } = meter;

  const hasSessionData = meter.stats.elapsedMs > 0;
  const isMeasuring = status === "measuring";
  const isRequesting = status === "requesting-permission";
  const showMeterUI = isMeasuring || status === "stopped";
  const canStart = !isMeasuring && !isRequesting;

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
          <div className="rounded-2xl bg-white/60 py-4 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800/60 dark:ring-white/10">
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
