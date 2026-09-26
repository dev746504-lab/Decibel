"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAWeightingFilter, type WeightingFilter } from "@/lib/aWeighting";

export type MeterStatus =
  | "idle"
  | "requesting-permission"
  | "measuring"
  | "stopped"
  | "unsupported"
  | "permission-denied"
  | "error";

export type WeightingMode = "Z" | "A";
export type TimeWeighting = "fast" | "slow";

export interface ChartPoint {
  t: number;
  db: number;
}

export interface MeterStats {
  min: number | null;
  max: number | null;
  peak: number | null;
  avg: number | null;
  elapsedMs: number;
}

const CHART_WINDOW_MS = 60_000;
const OFFSET_STORAGE_KEY = "deciben:offsetDb";
const DEFAULT_OFFSET_DB = 90;
const TIME_CONSTANTS: Record<TimeWeighting, number> = { fast: 0.125, slow: 1.0 };

// Fallback constants (AnalyserNode path)
const FALLBACK_INTERVAL_MS = 100;
const FFT_SIZE = 2048;

function readStoredOffset(): number {
  if (typeof window === "undefined") return DEFAULT_OFFSET_DB;
  const raw = window.localStorage.getItem(OFFSET_STORAGE_KEY);
  const parsed = raw !== null ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_OFFSET_DB;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

function msToDbfs(meanSquare: number): number {
  return meanSquare > 0 ? 10 * Math.log10(meanSquare) : -100;
}

function peakToDbfs(peakAbs: number): number {
  return peakAbs > 0 ? 20 * Math.log10(peakAbs) : -100;
}

export function useDecibelMeter() {
  const [status, setStatus] = useState<MeterStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentDb, setCurrentDb] = useState<number | null>(null);
  const [chartHistory, setChartHistory] = useState<ChartPoint[]>([]);
  const [stats, setStats] = useState<MeterStats>({ min: null, max: null, peak: null, avg: null, elapsedMs: 0 });
  const [weighting, setWeightingState] = useState<WeightingMode>("Z");
  const [offsetDb, setOffsetDbState] = useState<number>(readStoredOffset);
  const [timeWeighting, setTimeWeightingState] = useState<TimeWeighting>("fast");
  const [usingWorklet, setUsingWorklet] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const weightingFilterRef = useRef<WeightingFilter | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  // AudioWorklet path
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // AnalyserNode fallback path
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackWeightedMSRef = useRef<number>(0);
  const fallbackInitializedRef = useRef<boolean>(false);

  // Shared tracking refs
  const startTimeRef = useRef<number>(0);
  const sessionLogRef = useRef<ChartPoint[]>([]);
  const minRef = useRef<number | null>(null);
  const maxRef = useRef<number | null>(null);
  const peakRef = useRef<number | null>(null);
  // Leq accumulators (fallback path; worklet tracks its own)
  const fallbackSumSqRef = useRef<number>(0);
  const fallbackCountRef = useRef<number>(0);
  const offsetDbRef = useRef<number>(offsetDb);
  const weightingRef = useRef<WeightingMode>(weighting);
  const timeWeightingRef = useRef<TimeWeighting>(timeWeighting);

  useEffect(() => { offsetDbRef.current = offsetDb; }, [offsetDb]);
  useEffect(() => { weightingRef.current = weighting; }, [weighting]);
  useEffect(() => { timeWeightingRef.current = timeWeighting; }, [timeWeighting]);

  // ── Wake Lock ──────────────────────────────────────────────

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    const nav = navigator as unknown as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    try {
      const sentinel = await nav.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => { wakeLockRef.current = null; });
    } catch { /* nice-to-have */ }
  }, []);

  // ── Audio graph wiring ────────────────────────────────────

  const getMeasurementNode = useCallback((): AudioNode | null => {
    return workletNodeRef.current ?? analyserRef.current ?? null;
  }, []);

  const rebuildAudioGraph = useCallback((mode: WeightingMode) => {
    const source = sourceRef.current;
    const dest = getMeasurementNode();
    if (!source || !dest) return;

    source.disconnect();
    if (weightingFilterRef.current) {
      weightingFilterRef.current.disconnect();
      weightingFilterRef.current = null;
    }

    if (mode === "A" && audioContextRef.current) {
      const filter = createAWeightingFilter(audioContextRef.current);
      source.connect(filter.input);
      filter.output.connect(dest);
      weightingFilterRef.current = filter;
    } else {
      source.connect(dest);
    }
  }, [getMeasurementNode]);

  // ── Shared measurement handler (both paths feed into this) ──

  const handleMeasurement = useCallback((
    timeWeightedDb: number,
    peakDb: number,
    leqDb: number,
  ) => {
    minRef.current = minRef.current === null ? timeWeightedDb : Math.min(minRef.current, timeWeightedDb);
    maxRef.current = maxRef.current === null ? timeWeightedDb : Math.max(maxRef.current, timeWeightedDb);
    peakRef.current = peakRef.current === null ? peakDb : Math.max(peakRef.current, peakDb);

    const elapsedMs = performance.now() - startTimeRef.current;
    const point: ChartPoint = { t: elapsedMs, db: timeWeightedDb };
    sessionLogRef.current.push(point);

    setCurrentDb(timeWeightedDb);
    setChartHistory((prev) => {
      const next = [...prev, point];
      const cutoff = elapsedMs - CHART_WINDOW_MS;
      while (next.length > 0 && next[0].t < cutoff) next.shift();
      return next;
    });
    setStats({
      min: minRef.current,
      max: maxRef.current,
      peak: peakRef.current,
      avg: leqDb,
      elapsedMs,
    });
  }, []);

  // ── AnalyserNode fallback tick ─────────────────────────────

  const fallbackTick = useCallback(() => {
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    const ctx = audioContextRef.current;
    if (!analyser || !buffer || !ctx) return;

    analyser.getFloatTimeDomainData(buffer);

    const tau = TIME_CONSTANTS[timeWeightingRef.current];
    const blockDuration = buffer.length / ctx.sampleRate;
    const alpha = 1.0 - Math.exp(-blockDuration / tau);

    let blockSumSq = 0;
    let blockPeak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sq = buffer[i] * buffer[i];
      blockSumSq += sq;
      const abs = Math.abs(buffer[i]);
      if (abs > blockPeak) blockPeak = abs;
    }
    const blockMeanSq = blockSumSq / buffer.length;

    if (!fallbackInitializedRef.current) {
      fallbackWeightedMSRef.current = blockMeanSq;
      fallbackInitializedRef.current = true;
    } else {
      fallbackWeightedMSRef.current += alpha * (blockMeanSq - fallbackWeightedMSRef.current);
    }

    fallbackSumSqRef.current += blockSumSq;
    fallbackCountRef.current += buffer.length;

    const offset = offsetDbRef.current;
    const twDb = msToDbfs(fallbackWeightedMSRef.current) + offset;
    const pkDb = peakToDbfs(blockPeak) + offset;
    const leqDb = msToDbfs(fallbackSumSqRef.current / fallbackCountRef.current) + offset;

    handleMeasurement(twDb, pkDb, leqDb);
  }, [handleMeasurement]);

  // ── Cleanup ────────────────────────────────────────────────

  const cleanupAudio = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.port.close();
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (weightingFilterRef.current) {
      weightingFilterRef.current.disconnect();
      weightingFilterRef.current = null;
    }
    analyserRef.current = null;
    bufferRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    void releaseWakeLock();
  }, [releaseWakeLock]);

  // ── Start ──────────────────────────────────────────────────

  const start = useCallback(async () => {
    setErrorMessage(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setErrorMessage("Trình duyệt của bạn không hỗ trợ truy cập micro (getUserMedia). Hãy thử Chrome, Firefox hoặc Safari bản mới.");
      return;
    }
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) {
      setStatus("unsupported");
      setErrorMessage("Trình duyệt của bạn không hỗ trợ Web Audio API.");
      return;
    }

    setStatus("requesting-permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Reset shared state
      startTimeRef.current = performance.now();
      sessionLogRef.current = [];
      minRef.current = null;
      maxRef.current = null;
      peakRef.current = null;
      setChartHistory([]);
      setStats({ min: null, max: null, peak: null, avg: null, elapsedMs: 0 });

      // Try AudioWorklet first, fall back to AnalyserNode
      let workletLoaded = false;
      if (audioContext.audioWorklet) {
        try {
          await audioContext.audioWorklet.addModule("/decibel-worklet.js");
          workletLoaded = true;
        } catch {
          workletLoaded = false;
        }
      }

      if (workletLoaded) {
        const workletNode = new AudioWorkletNode(audioContext, "decibel-processor");
        workletNodeRef.current = workletNode;
        setUsingWorklet(true);

        workletNode.port.postMessage({
          type: "setTimeConstant",
          value: TIME_CONSTANTS[timeWeightingRef.current],
        });

        workletNode.port.onmessage = (e: MessageEvent) => {
          if (e.data.type !== "measurement") return;
          const offset = offsetDbRef.current;
          const twDb = msToDbfs(e.data.timeWeightedMS) + offset;
          const pkDb = peakToDbfs(e.data.blockPeak) + offset;
          const leqDb = msToDbfs(e.data.leqMeanSq) + offset;
          handleMeasurement(twDb, pkDb, leqDb);
        };
      } else {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
        analyserRef.current = analyser;
        bufferRef.current = new Float32Array(analyser.fftSize);
        fallbackWeightedMSRef.current = 0;
        fallbackInitializedRef.current = false;
        fallbackSumSqRef.current = 0;
        fallbackCountRef.current = 0;
        setUsingWorklet(false);
      }

      rebuildAudioGraph(weightingRef.current);

      if (!workletLoaded) {
        intervalRef.current = setInterval(fallbackTick, FALLBACK_INTERVAL_MS);
      }

      setStatus("measuring");
      void requestWakeLock();
    } catch (err) {
      cleanupAudio();
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setStatus("permission-denied");
        setErrorMessage("Bạn đã từ chối quyền truy cập micro. Hãy cấp quyền micro cho trang này trong cài đặt trình duyệt rồi thử lại.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setStatus("error");
        setErrorMessage("Không tìm thấy micro nào trên thiết bị này.");
      } else {
        setStatus("error");
        setErrorMessage("Đã xảy ra lỗi khi truy cập micro. Vui lòng thử lại.");
      }
    }
  }, [cleanupAudio, fallbackTick, handleMeasurement, rebuildAudioGraph, requestWakeLock]);

  const stop = useCallback(() => {
    cleanupAudio();
    setStatus((prev) => (prev === "measuring" ? "stopped" : prev));
    setCurrentDb(null);
  }, [cleanupAudio]);

  const reset = useCallback(() => {
    sessionLogRef.current = [];
    minRef.current = null;
    maxRef.current = null;
    peakRef.current = null;
    fallbackWeightedMSRef.current = 0;
    fallbackInitializedRef.current = false;
    fallbackSumSqRef.current = 0;
    fallbackCountRef.current = 0;
    startTimeRef.current = performance.now();
    setChartHistory([]);
    setStats({ min: null, max: null, peak: null, avg: null, elapsedMs: 0 });

    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: "reset" });
    }
  }, []);

  // ── Weighting controls ────────────────────────────────────

  const setWeighting = useCallback(
    (mode: WeightingMode) => {
      setWeightingState(mode);
      weightingRef.current = mode;
      if (status === "measuring") rebuildAudioGraph(mode);
    },
    [rebuildAudioGraph, status],
  );

  const setTimeWeighting = useCallback(
    (tw: TimeWeighting) => {
      setTimeWeightingState(tw);
      timeWeightingRef.current = tw;
      if (workletNodeRef.current) {
        workletNodeRef.current.port.postMessage({
          type: "setTimeConstant",
          value: TIME_CONSTANTS[tw],
        });
      }
    },
    [],
  );

  const setOffsetDb = useCallback((value: number) => {
    setOffsetDbState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OFFSET_STORAGE_KEY, String(value));
    }
  }, []);

  // ── CSV export ─────────────────────────────────────────────

  const exportCsv = useCallback(() => {
    const rows = sessionLogRef.current;
    if (rows.length === 0) return;

    const header = "thoi_gian_ms,thoi_gian_s,dB\n";
    const body = rows.map((r) => `${r.t.toFixed(0)},${(r.t / 1000).toFixed(2)},${r.db.toFixed(2)}`).join("\n");
    const csv = header + body;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `deciben-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // ── Side effects ───────────────────────────────────────────

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && status === "measuring" && !wakeLockRef.current) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [requestWakeLock, status]);

  useEffect(() => {
    return () => { cleanupAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    errorMessage,
    currentDb,
    chartHistory,
    stats,
    weighting,
    offsetDb,
    timeWeighting,
    usingWorklet,
    start,
    stop,
    reset,
    setWeighting,
    setTimeWeighting,
    setOffsetDb,
    exportCsv,
  };
}
