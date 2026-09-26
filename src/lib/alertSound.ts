let alertContext: AudioContext | null = null;
let isPlaying = false;

const FREQUENCIES = [1800, 2400];
const ALERT_DURATION_MS = 800;
const OSCILLATION_RATE = 8;

function getAlertContext(): AudioContext {
  if (!alertContext || alertContext.state === "closed") {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    alertContext = new Ctor();
  }
  return alertContext;
}

export function playAlertSound(): void {
  if (isPlaying) return;
  isPlaying = true;

  const ctx = getAlertContext();
  if (ctx.state === "suspended") ctx.resume();

  const duration = ALERT_DURATION_MS / 1000;
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.7, now);
  masterGain.gain.setValueAtTime(0, now + duration);
  masterGain.connect(ctx.destination);

  for (const freq of FREQUENCIES) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now);

    for (let t = 0; t < duration; t += 1 / OSCILLATION_RATE) {
      const idx = Math.round(t * OSCILLATION_RATE) % FREQUENCIES.length;
      osc.frequency.setValueAtTime(FREQUENCIES[idx], now + t);
    }

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, now);
    osc.connect(oscGain);
    oscGain.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  const distortion = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = (Math.PI + 50) * x / (Math.PI + 50 * Math.abs(x));
  }
  distortion.curve = curve;
  distortion.oversample = "4x";

  const harshOsc = ctx.createOscillator();
  harshOsc.type = "sawtooth";
  harshOsc.frequency.setValueAtTime(3200, now);
  harshOsc.frequency.linearRampToValueAtTime(1600, now + duration);

  const harshGain = ctx.createGain();
  harshGain.gain.setValueAtTime(0.3, now);
  harshGain.gain.setValueAtTime(0, now + duration);

  harshOsc.connect(distortion);
  distortion.connect(harshGain);
  harshGain.connect(masterGain);
  harshOsc.start(now);
  harshOsc.stop(now + duration);

  setTimeout(() => {
    isPlaying = false;
  }, ALERT_DURATION_MS);
}

export function disposeAlertContext(): void {
  if (alertContext && alertContext.state !== "closed") {
    alertContext.close().catch(() => {});
  }
  alertContext = null;
  isPlaying = false;
}
