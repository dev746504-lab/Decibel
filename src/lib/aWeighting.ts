/**
 * A-weighting filter (IEC 61672) built at the AudioContext's actual sample
 * rate via an exact bilinear transform of the standard analog prototype.
 *
 * Analog prototype (poles are real, so this only needs real arithmetic):
 *   H(s) = k * s^4 / [(s+w1)^2 (s+w2) (s+w3) (s+w4)^2]
 * with f1=20.598997, f2=107.65265, f3=737.86223, f4=12194.217 Hz, and k
 * chosen so the response is 0 dB at 1 kHz.
 *
 * Falls back to a cascade of BiquadFilterNodes (an approximation) when
 * IIRFilterNode is not available in the browser.
 */

const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;

function polyFromRealRoots(roots: number[]): number[] {
  // Builds the monic polynomial coefficients (highest degree first)
  // for prod(x - root) over all roots.
  let coeffs = [1];
  for (const r of roots) {
    const next = new Array(coeffs.length + 1).fill(0);
    for (let i = 0; i < coeffs.length; i++) {
      next[i] += coeffs[i];
      next[i + 1] -= coeffs[i] * r;
    }
    coeffs = next;
  }
  return coeffs;
}

export function isIIRFilterSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { IIRFilterNode?: unknown }).IIRFilterNode !== "undefined";
}

function designAWeightingCoefficients(sampleRate: number): { feedforward: number[]; feedback: number[] } {
  const w1 = 2 * Math.PI * F1;
  const w2 = 2 * Math.PI * F2;
  const w3 = 2 * Math.PI * F3;
  const w4 = 2 * Math.PI * F4;
  const analogPoles = [-w1, -w1, -w2, -w3, -w4, -w4];

  // Normalize analog gain so |H(j*2*pi*1000)| = 1 (0 dB at 1 kHz).
  const w1000 = 2 * Math.PI * 1000;
  let poleMagnitudeProduct = 1;
  for (const p of analogPoles) {
    poleMagnitudeProduct *= Math.sqrt(p * p + w1000 * w1000);
  }
  const kAnalog = poleMagnitudeProduct / Math.pow(w1000, 4);

  const fs2 = 2 * sampleRate;

  // Bilinear transform of the 4 analog zeros at s=0 -> digital zeros at z=1,
  // plus (poles - zeros) extra zeros at z=-1 to keep the transfer function proper.
  const digitalZeros = [1, 1, 1, 1, -1, -1];
  const digitalPoles = analogPoles.map((p) => (fs2 + p) / (fs2 - p));

  let poleTermProduct = 1;
  for (const p of analogPoles) {
    poleTermProduct *= fs2 - p;
  }
  const zeroTermProduct = Math.pow(fs2, 4); // prod(fs2 - 0) over the 4 analog zeros
  const kDigital = (kAnalog * zeroTermProduct) / poleTermProduct;

  const numeratorPoly = polyFromRealRoots(digitalZeros);
  const denominatorPoly = polyFromRealRoots(digitalPoles);

  return {
    feedforward: numeratorPoly.map((c) => c * kDigital),
    feedback: denominatorPoly,
  };
}

export interface WeightingFilter {
  /** Node the audio source should connect into. */
  input: AudioNode;
  /** Node downstream consumers (e.g. the analyser) should connect from. */
  output: AudioNode;
  /** Disconnects every internal node; call on teardown. */
  disconnect: () => void;
}

export function createAWeightingFilter(context: BaseAudioContext): WeightingFilter {
  if (isIIRFilterSupported()) {
    const { feedforward, feedback } = designAWeightingCoefficients(context.sampleRate);
    const node = new IIRFilterNode(context, { feedforward, feedback });
    return { input: node, output: node, disconnect: () => node.disconnect() };
  }
  return createAWeightingBiquadFallback(context);
}

function createAWeightingBiquadFallback(context: BaseAudioContext): WeightingFilter {
  const stages: BiquadFilterNode[] = [
    makeBiquad(context, "highpass", F1, 0.5),
    makeBiquad(context, "highpass", F1, 0.5),
    makeBiquad(context, "highpass", F2, 0.5),
    makeBiquad(context, "highpass", F3, 0.5),
    makeBiquad(context, "lowpass", F4, 0.5),
    makeBiquad(context, "lowpass", F4, 0.5),
  ];
  for (let i = 0; i < stages.length - 1; i++) {
    stages[i].connect(stages[i + 1]);
  }
  return {
    input: stages[0],
    output: stages[stages.length - 1],
    disconnect: () => stages.forEach((s) => s.disconnect()),
  };
}

function makeBiquad(context: BaseAudioContext, type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}
