'use client';

/**
 * CaribClear Sounds — synthesized with Web Audio API (zero asset weight).
 * Four signals: arrival (soft ding), approval (rising bell), alarm (low pulse),
 * message (pop). Respects user mute + quiet hours (23:00–07:00) unless critical.
 */

type SoundName = 'arrival' | 'approval' | 'alarm' | 'message';

const PREF_KEY = 'cc-sounds';

export function soundsEnabled(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}

export function setSoundsEnabled(on: boolean) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

function inQuietHours(): boolean {
  const h = new Date().getHours();
  return h >= 23 || h < 7;
}

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, gainPeak: number, type: OscillatorType = 'sine') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(gainPeak, c.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

export function playSound(name: SoundName, opts?: { critical?: boolean }) {
  if (!soundsEnabled()) return;
  if (inQuietHours() && !opts?.critical) return;
  const c = audioCtx();
  if (!c) return;
  switch (name) {
    case 'arrival': // soft two-note ding
      tone(c, 880, 0, 0.18, 0.12);
      tone(c, 1320, 0.12, 0.25, 0.10);
      break;
    case 'approval': // rising bell
      tone(c, 659, 0, 0.15, 0.12);
      tone(c, 880, 0.10, 0.15, 0.12);
      tone(c, 1174, 0.20, 0.30, 0.10);
      break;
    case 'alarm': // low pulsing — demurrage red
      tone(c, 220, 0, 0.22, 0.16, 'square');
      tone(c, 196, 0.28, 0.30, 0.16, 'square');
      break;
    case 'message': // pop
      tone(c, 520, 0, 0.09, 0.10, 'triangle');
      tone(c, 700, 0.07, 0.12, 0.08, 'triangle');
      break;
  }
}

/** Haptics where available (phone resources). */
export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
