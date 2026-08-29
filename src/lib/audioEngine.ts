/**
 * LoopBreak — Procedural Web Audio Synthesizer
 * Zero external audio assets. All sounds generated in real-time.
 */

let audioCtx: AudioContext | null = null;
let tensionOsc: OscillatorNode | null = null;
let tensionGain: GainNode | null = null;
let tensionFilter: BiquadFilterNode | null = null;
let masterGain: GainNode | null = null;
let muted = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

// ── Tension Hum ────────────────────────────────
// Low-frequency sine (55 Hz) modulated by reframe progress

export function startTensionHum() {
  if (muted) return;
  const ctx = getCtx();
  if (tensionOsc) return; // already running

  tensionOsc = ctx.createOscillator();
  tensionGain = ctx.createGain();
  tensionFilter = ctx.createBiquadFilter();

  tensionOsc.type = "sine";
  tensionOsc.frequency.value = 55;

  tensionFilter.type = "lowpass";
  tensionFilter.frequency.value = 200;
  tensionFilter.Q.value = 2;

  tensionGain.gain.value = 0;

  tensionOsc.connect(tensionFilter);
  tensionFilter.connect(tensionGain);
  tensionGain.connect(getMaster());
  tensionOsc.start();
}

export function updateTensionHum(progress: number) {
  // progress: 0 → 1
  if (!tensionGain || !tensionFilter || muted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Fade in volume: 0 → 0.15
  tensionGain.gain.linearRampToValueAtTime(
    progress * 0.15,
    now + 0.1
  );

  // Open filter: 200 Hz → 800 Hz
  tensionFilter.frequency.linearRampToValueAtTime(
    200 + progress * 600,
    now + 0.1
  );
}

export function stopTensionHum() {
  if (!tensionOsc || !tensionGain) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  tensionGain.gain.linearRampToValueAtTime(0, now + 0.3);
  setTimeout(() => {
    tensionOsc?.stop();
    tensionOsc = null;
    tensionGain = null;
    tensionFilter = null;
  }, 400);
}

// ── Crack Impact ───────────────────────────────
// Filtered white noise burst at keypress milestones

export function playCrack() {
  if (muted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;

  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2000 + Math.random() * 2000;
  filter.Q.value = 8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(getMaster());
  source.start(now);
  source.stop(now + 0.15);
}

// ── Dissolution Chime ──────────────────────────
// FM synthesis bell chords (C5, E5, G5, B5, D6)

export function playDissolutionChime() {
  if (muted) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  const master = getMaster();

  // Pentatonic frequencies (Hz)
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];

  notes.forEach((freq, i) => {
    const delay = i * 0.08;
    const t = now + delay;

    // Carrier
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    // FM modulator
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = freq * 2;

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 0.3, t);
    modGain.gain.exponentialRampToValueAtTime(0.01, t + 2);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    // Amplitude envelope
    const ampGain = ctx.createGain();
    ampGain.gain.setValueAtTime(0, t);
    ampGain.gain.linearRampToValueAtTime(0.08, t + 0.02);
    ampGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

    // Reverb-like delay
    const delay1 = ctx.createDelay();
    delay1.delayTime.value = 0.12;
    const delayGain = ctx.createGain();
    delayGain.gain.value = 0.3;

    carrier.connect(ampGain);
    ampGain.connect(master);
    ampGain.connect(delay1);
    delay1.connect(delayGain);
    delayGain.connect(master);

    carrier.start(t);
    carrier.stop(t + 3);
    modulator.start(t);
    modulator.stop(t + 3);
  });
}

// ── Controls ───────────────────────────────────

export function setMuted(value: boolean) {
  muted = value;
  if (value) {
    stopTensionHum();
  }
}

export function isMuted() {
  return muted;
}

export function initAudio() {
  getCtx();
}
