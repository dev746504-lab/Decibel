"use client";

import type { WeightingMode, TimeWeighting } from "@/hooks/useDecibelMeter";

interface CalibrationPanelProps {
  offsetDb: number;
  onOffsetChange: (value: number) => void;
  weighting: WeightingMode;
  onWeightingChange: (mode: WeightingMode) => void;
  timeWeighting: TimeWeighting;
  onTimeWeightingChange: (tw: TimeWeighting) => void;
  usingWorklet: boolean;
  isMeasuring: boolean;
}

const OFFSET_STEP = 0.5;
const OFFSET_MIN = 0;
const OFFSET_MAX = 150;

export default function CalibrationPanel({
  offsetDb,
  onOffsetChange,
  weighting,
  onWeightingChange,
  timeWeighting,
  onTimeWeightingChange,
  usingWorklet,
  isMeasuring,
}: CalibrationPanelProps) {
  const clamp = (v: number) => Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, v));

  return (
    <div className="w-full rounded-2xl bg-white/60 p-4 shadow-sm ring-1 ring-slate-900/5 backdrop-blur dark:bg-slate-800/60 dark:ring-white/10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <label htmlFor="offset-input" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Hiệu chỉnh (offset dB)
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOffsetChange(clamp(offsetDb - OFFSET_STEP))}
                className="h-8 w-8 rounded-full bg-slate-200 text-lg leading-none text-slate-700 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                aria-label="Giảm offset"
              >
                −
              </button>
              <input
                id="offset-input"
                type="number"
                inputMode="decimal"
                step={OFFSET_STEP}
                value={offsetDb}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) onOffsetChange(clamp(v));
                }}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-sm tabular-nums text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => onOffsetChange(clamp(offsetDb + OFFSET_STEP))}
                className="h-8 w-8 rounded-full bg-slate-200 text-lg leading-none text-slate-700 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                aria-label="Tăng offset"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Trọng số tần số</span>
            <div className="mt-1.5 flex overflow-hidden rounded-lg ring-1 ring-slate-300 dark:ring-slate-600">
              {(["Z", "A"] as WeightingMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onWeightingChange(mode)}
                  className={`px-4 py-1.5 text-sm font-medium transition ${
                    weighting === mode
                      ? "bg-sky-500 text-white"
                      : "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {mode === "Z" ? "Z (phẳng)" : "A · dB(A)"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Tốc độ đo (IEC 61672)</span>
            <div className="mt-1.5 flex overflow-hidden rounded-lg ring-1 ring-slate-300 dark:ring-slate-600">
              {(["fast", "slow"] as TimeWeighting[]).map((tw) => (
                <button
                  key={tw}
                  type="button"
                  onClick={() => onTimeWeightingChange(tw)}
                  className={`px-4 py-1.5 text-sm font-medium transition ${
                    timeWeighting === tw
                      ? "bg-sky-500 text-white"
                      : "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {tw === "fast" ? "Nhanh (125 ms)" : "Chậm (1 s)"}
                </button>
              ))}
            </div>
          </div>

          {isMeasuring && (
            <div className="flex items-center gap-1.5 self-end">
              <span
                className={`inline-block h-2 w-2 rounded-full ${usingWorklet ? "bg-green-500" : "bg-amber-500"}`}
              />
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {usingWorklet ? "AudioWorklet (chính xác cao)" : "AnalyserNode (dự phòng)"}
              </span>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Giá trị offset dùng để căn chỉnh theo một máy đo dB chuẩn. Đây chỉ là giá trị tham khảo — micro của điện thoại và laptop không được
        hiệu chuẩn để đo dB SPL chính xác tuyệt đối.
      </p>
    </div>
  );
}
