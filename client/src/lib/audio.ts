// Web Audio API Synthesizer for Official Government Chimes and Notifications
// Generates soft, crystal-clear, professional audio without external assets

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (err) {
    console.warn('Web Audio API not supported or blocked', err);
    return null;
  }
}

const SOUND_STORAGE_KEY = 'ports_sound_enabled';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(SOUND_STORAGE_KEY);
  return val === null ? true : val === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('ports_sound_toggled', { detail: { enabled } }));
}

/**
 * Play a warm, subtle 2-tone chime for executive tasks and official directives
 */
export function playSubtleChime(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // First Tone: D5 (587.33 Hz)
  playTone(ctx, 587.33, now, 0.45, 0.12);

  // Second Tone: A5 (880.00 Hz)
  playTone(ctx, 880.0, now + 0.12, 0.7, 0.16);
}

/**
 * Play an elegant 3-tone chime for urgent notices or executive priority tasks
 */
export function playUrgentAlert(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1: E5 (659.25 Hz)
  playTone(ctx, 659.25, now, 0.35, 0.14);

  // Tone 2: G#5 (830.61 Hz)
  playTone(ctx, 830.61, now + 0.1, 0.35, 0.15);

  // Tone 3: B5 (987.77 Hz)
  playTone(ctx, 987.77, now + 0.22, 0.7, 0.18);
}

/**
 * Play a light success chime when submitting reports or completing operations
 */
export function playSuccessChime(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1: F5 (698.46 Hz)
  playTone(ctx, 698.46, now, 0.3, 0.1);

  // Tone 2: C6 (1046.5 Hz)
  playTone(ctx, 1046.5, now + 0.1, 0.55, 0.13);
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume = 0.15,
) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Pure sine wave with slight harmonic overtone for a metallic bell resonance
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    // Envelope: quick attack, smooth exponential decay
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  } catch (err) {
    console.debug('Error generating chime tone', err);
  }
}
