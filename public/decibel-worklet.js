/**
 * AudioWorklet processor for sample-accurate dB measurement.
 *
 * Processes every audio sample (128-sample render quanta) with no gaps,
 * unlike AnalyserNode snapshots which can miss or double-count samples.
 *
 * Applies IEC 61672 exponential time weighting per sample:
 *   y²[n] = α·x²[n] + (1−α)·y²[n−1]
 *   α = 1 − exp(−1 / (fs · τ))
 * where τ = 0.125s (Fast) or 1.0s (Slow).
 */

class DecibelProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // IEC 61672 time constant — Fast by default
    this._tau = 0.125;

    // Exponential time-weighted running mean square
    this._weightedMS = 0;
    this._initialized = false;

    // Per-report-window accumulators
    this._blockSumSq = 0;
    this._blockCount = 0;
    this._blockPeak = 0;

    // Session-wide accumulators for Leq (equivalent continuous level)
    this._totalSumSq = 0;
    this._totalCount = 0;

    // Report at ~10 Hz
    this._samplesSinceReport = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === "setTimeConstant") {
        this._tau = e.data.value;
      } else if (e.data.type === "reset") {
        this._totalSumSq = 0;
        this._totalCount = 0;
        this._weightedMS = 0;
        this._initialized = false;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];
    const fs = sampleRate; // AudioWorkletGlobalScope global
    const alpha = 1.0 - Math.exp(-1.0 / (fs * this._tau));

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const sq = s * s;

      // IEC 61672 exponential time weighting (per-sample)
      if (!this._initialized) {
        this._weightedMS = sq;
        this._initialized = true;
      } else {
        this._weightedMS += alpha * (sq - this._weightedMS);
      }

      // Block accumulators
      this._blockSumSq += sq;
      this._blockCount++;
      const abs = s < 0 ? -s : s;
      if (abs > this._blockPeak) this._blockPeak = abs;

      // Session accumulators
      this._totalSumSq += sq;
      this._totalCount++;
    }

    this._samplesSinceReport += samples.length;
    const samplesPerReport = (fs * 0.1) | 0; // ~100 ms

    if (this._samplesSinceReport >= samplesPerReport) {
      this.port.postMessage({
        type: "measurement",
        timeWeightedMS: this._weightedMS,
        blockMeanSq: this._blockSumSq / this._blockCount,
        blockPeak: this._blockPeak,
        leqMeanSq: this._totalSumSq / this._totalCount,
        totalSamples: this._totalCount,
      });

      this._blockSumSq = 0;
      this._blockCount = 0;
      this._blockPeak = 0;
      this._samplesSinceReport = 0;
    }

    return true;
  }
}

registerProcessor("decibel-processor", DecibelProcessor);
