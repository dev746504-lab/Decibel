let alertContext: AudioContext | null = null;
let isPlaying = false;

// Còi báo động quân sự — quét tần số lên xuống
const FREQ_LOW = 380;
const FREQ_HIGH = 860;
const ALERT_DURATION_S = 1.8;
const SWEEP_CYCLES = 2;

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

  const now = ctx.currentTime;
  const end = now + ALERT_DURATION_S;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.75, now);
  master.gain.linearRampToValueAtTime(0.75, end - 0.15);
  master.gain.linearRampToValueAtTime(0, end);
  master.connect(ctx.destination);

  // Siren: quét tần số lên xuống
  const siren = ctx.createOscillator();
  siren.type = "sawtooth";
  const sweepDuration = ALERT_DURATION_S / SWEEP_CYCLES;
  for (let c = 0; c < SWEEP_CYCLES; c++) {
    const t0 = now + c * sweepDuration;
    const tMid = t0 + sweepDuration * 0.5;
    const t1 = t0 + sweepDuration;
    siren.frequency.setValueAtTime(FREQ_LOW, t0);
    siren.frequency.linearRampToValueAtTime(FREQ_HIGH, tMid);
    siren.frequency.linearRampToValueAtTime(FREQ_LOW, t1);
  }

  const sirenGain = ctx.createGain();
  sirenGain.gain.setValueAtTime(0.45, now);
  siren.connect(sirenGain);
  sirenGain.connect(master);
  siren.start(now);
  siren.stop(end);

  // Harmonic layer — cùng quét nhưng octave trên, nhỏ hơn
  const harmonic = ctx.createOscillator();
  harmonic.type = "square";
  for (let c = 0; c < SWEEP_CYCLES; c++) {
    const t0 = now + c * sweepDuration;
    const tMid = t0 + sweepDuration * 0.5;
    const t1 = t0 + sweepDuration;
    harmonic.frequency.setValueAtTime(FREQ_LOW * 2, t0);
    harmonic.frequency.linearRampToValueAtTime(FREQ_HIGH * 2, tMid);
    harmonic.frequency.linearRampToValueAtTime(FREQ_LOW * 2, t1);
  }
  const harmonicGain = ctx.createGain();
  harmonicGain.gain.setValueAtTime(0.15, now);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(master);
  harmonic.start(now);
  harmonic.stop(end);

  // Sub rumble — tần số thấp tạo cảm giác nặng nề
  const sub = ctx.createOscillator();
  sub.type = "sine";
  for (let c = 0; c < SWEEP_CYCLES; c++) {
    const t0 = now + c * sweepDuration;
    const tMid = t0 + sweepDuration * 0.5;
    const t1 = t0 + sweepDuration;
    sub.frequency.setValueAtTime(FREQ_LOW * 0.5, t0);
    sub.frequency.linearRampToValueAtTime(FREQ_HIGH * 0.5, tMid);
    sub.frequency.linearRampToValueAtTime(FREQ_LOW * 0.5, t1);
  }
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.25, now);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(now);
  sub.stop(end);

  // Distortion cho chất khô, chói
  const distortion = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = (Math.PI + 30) * x / (Math.PI + 30 * Math.abs(x));
  }
  distortion.curve = curve;
  distortion.oversample = "4x";

  sirenGain.disconnect();
  sirenGain.connect(distortion);
  distortion.connect(master);

  setTimeout(() => {
    isPlaying = false;
  }, ALERT_DURATION_S * 1000);
}

export function disposeAlertContext(): void {
  if (alertContext && alertContext.state !== "closed") {
    alertContext.close().catch(() => {});
  }
  alertContext = null;
  isPlaying = false;
}
