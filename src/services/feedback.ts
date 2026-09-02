/**
 * PACE — Feedback.
 *
 * Sound and haptics, paired. Synthesised with WebAudio rather than loaded from
 * files: nothing to ship, nothing to fail inside a WebView.
 *
 * The cues are modelled on a *struck bar* — a marimba or a wooden block —
 * rather than on a tone generator. A bare sine is what a beep sounds like; an
 * instrument is three things at once:
 *
 *   1. a mallet transient (a few milliseconds of filtered noise),
 *   2. a fundamental that decays exponentially while dropping slightly in
 *      pitch, the way a physical body does as it loses energy,
 *   3. an inharmonic partial well above it, decaying faster, which is what the
 *      ear hears as "wood" instead of "electronics".
 *
 * A lowpass closes over the tail so the sound darkens as it fades. That single
 * detail is most of the difference between cheap and expensive.
 */

import type { Platform } from '../platform/types';

/**
 * Poucos, e todos por acabar alguma coisa.
 *
 * Um som a cada toque deixa de ser informação e passa a ser barulho — a forma
 * mais rápida de uma aplicação ser silenciada para sempre. Estes tocam quando
 * algo **fica feito**, e sobem de importância na mesma ordem em que aparecem:
 *
 * - `complete` — um hábito ou uma tarefa;
 * - `workout` — um treino fechado;
 * - `goal` — um objetivo cumprido;
 * - `streak` — a sequência a subir;
 * - `perfect` — o dia perfeito, o único que se pode dar ao luxo de soar;
 * - `success` — fim de onboarding e de sessões longas.
 *
 * Tudo o resto é só háptica.
 */
export type Cue = 'complete' | 'workout' | 'goal' | 'streak' | 'perfect' | 'success';

/** Master level. The app should sit under a keyboard, never over it. */
const MASTER_GAIN = 0.5;

/** The 2.76 ratio is the classic bar-mode interval; it reads as wood. */
const PARTIAL_RATIO = 2.76;

interface Strike {
  freq: number;
  /** Seconds from the start of the cue. */
  at: number;
  /** Seconds; how long the fundamental takes to die away. */
  decay: number;
  gain: number;
}

const CUES: Record<Cue, Strike[]> = {
  // A rising perfect fifth: unmistakably "done", without being a fanfare.
  complete: [
    { freq: 587.33, at: 0, decay: 0.22, gain: 0.7 },
    { freq: 880.0, at: 0.055, decay: 0.32, gain: 0.55 },
  ],

  // Treino fechado: duas notas graves, mais cheias — o peso de ter acabado.
  workout: [
    { freq: 392.0, at: 0, decay: 0.3, gain: 0.7 },
    { freq: 587.33, at: 0.09, decay: 0.45, gain: 0.6 },
  ],

  // Objetivo cumprido: uma quarta a subir e a assentar.
  goal: [
    { freq: 523.25, at: 0, decay: 0.24, gain: 0.6 },
    { freq: 698.46, at: 0.07, decay: 0.45, gain: 0.62 },
  ],

  // Sequência: três notas curtas a subir, como um degrau a mais.
  streak: [
    { freq: 659.25, at: 0, decay: 0.16, gain: 0.5 },
    { freq: 783.99, at: 0.06, decay: 0.18, gain: 0.55 },
    { freq: 1046.5, at: 0.12, decay: 0.42, gain: 0.6 },
  ],

  // Dia perfeito: o mais raro, e o único com uma nota a demorar a apagar-se.
  perfect: [
    { freq: 523.25, at: 0, decay: 0.22, gain: 0.6 },
    { freq: 659.25, at: 0.075, decay: 0.24, gain: 0.6 },
    { freq: 783.99, at: 0.15, decay: 0.28, gain: 0.65 },
    { freq: 1046.5, at: 0.235, decay: 0.9, gain: 0.7 },
  ],

  // A major triad with a long final note — the only cue allowed to ring, and
  // it should be rare enough to still mean something when it does.
  success: [
    { freq: 523.25, at: 0, decay: 0.26, gain: 0.65 },
    { freq: 659.25, at: 0.085, decay: 0.3, gain: 0.65 },
    { freq: 783.99, at: 0.17, decay: 0.7, gain: 0.75 },
  ],
};

const HAPTIC: Record<Cue, 'light' | 'medium' | 'heavy' | 'success'> = {
  complete: 'light',
  workout: 'medium',
  goal: 'medium',
  streak: 'medium',
  perfect: 'success',
  success: 'success',
};

type AudioContextCtor = typeof AudioContext;

export class FeedbackService {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private soundOn = true;
  private hapticsOn = true;

  constructor(private readonly platform: Platform) {}

  setPreferences(sound: boolean, haptics: boolean): void {
    this.soundOn = sound;
    this.hapticsOn = haptics;
  }

  /**
   * Both platforms refuse to start audio outside a user gesture, so the context
   * is created on the first cue — always inside one — and resumed if the OS
   * suspended it while backgrounded.
   */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.context) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        const context = new Ctor();
        const master = context.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(context.destination);
        this.context = context;
        this.master = master;
        this.noise = this.buildNoise(context);
      } catch {
        return null;
      }
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  /** 200 ms of white noise, built once and reused for every mallet transient. */
  private buildNoise(context: AudioContext): AudioBuffer {
    const frames = Math.floor(context.sampleRate * 0.2);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** One struck note: mallet, body, partial, and a closing filter. */
  private strike(context: AudioContext, out: AudioNode, note: Strike, start: number): void {
    const t = start + note.at;
    const end = t + note.decay;

    // The tone colour darkens as the note dies, which is what stops a short
    // sound from reading as a click.
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(note.freq * 6, t);
    tone.frequency.exponentialRampToValueAtTime(Math.max(220, note.freq * 1.2), end);
    tone.Q.value = 0.7;
    tone.connect(out);

    const body = context.createGain();
    body.gain.setValueAtTime(0.0001, t);
    // A 6 ms attack instead of an instant one: audible as softness, not delay.
    body.gain.exponentialRampToValueAtTime(note.gain, t + 0.006);
    body.gain.exponentialRampToValueAtTime(0.0001, end);
    body.connect(tone);

    const fundamental = context.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(note.freq, t);
    // Real bodies flatten slightly as they lose energy.
    fundamental.frequency.exponentialRampToValueAtTime(note.freq * 0.985, end);
    fundamental.connect(body);
    fundamental.start(t);
    fundamental.stop(end + 0.02);

    // The inharmonic partial: quieter, shorter, and the reason this reads as
    // a struck object rather than a tone generator.
    const partialGain = context.createGain();
    partialGain.gain.setValueAtTime(0.0001, t);
    partialGain.gain.exponentialRampToValueAtTime(note.gain * 0.28, t + 0.004);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, t + note.decay * 0.45);
    partialGain.connect(tone);

    const partial = context.createOscillator();
    partial.type = 'sine';
    partial.frequency.value = note.freq * PARTIAL_RATIO;
    partial.connect(partialGain);
    partial.start(t);
    partial.stop(end + 0.02);

    // The mallet: a bandpassed noise burst lasting ~12 ms.
    if (this.noise) {
      const source = context.createBufferSource();
      source.buffer = this.noise;

      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = note.freq * 3.2;
      band.Q.value = 1.1;

      const click = context.createGain();
      click.gain.setValueAtTime(note.gain * 0.5, t);
      click.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);

      source.connect(band);
      band.connect(click);
      click.connect(out);
      source.start(t);
      source.stop(t + 0.05);
    }
  }

  /** Haptics without sound — for the taps that should be felt but not heard. */
  touch(style: 'light' | 'medium' = 'light'): void {
    if (this.hapticsOn) void this.platform.device.haptic(style);
  }

  play(cue: Cue): void {
    if (this.hapticsOn) void this.platform.device.haptic(HAPTIC[cue]);
    if (!this.soundOn) return;

    const context = this.ensureContext();
    if (!context || !this.master) return;

    // A hair of air around the sound. Not reverb — just enough width that it
    // does not feel stuck to the speaker.
    const bus = context.createGain();
    bus.gain.value = 1;
    bus.connect(this.master);

    const start = context.currentTime + 0.005;
    for (const note of CUES[cue]) this.strike(context, bus, note, start);
  }

  /**
   * Prepara o áudio no primeiro toque do utilizador.
   *
   * Os browsers recusam iniciar áudio fora de um gesto. Chamar isto no
   * primeiro toque garante que o som existe quando for preciso — mesmo que a
   * primeira ocasião seja um dia perfeito que apareceu sozinho no ecrã. Se o
   * browser recusar, não acontece nada: não há erro nem consola suja.
   */
  unlock(): void {
    if (!this.soundOn) return;
    try {
      this.ensureContext();
    } catch {
      // Sem áudio disponível. A aplicação continua igual, só mais calada.
    }
  }

  /** Releases the audio hardware when the app goes to the background. */
  suspend(): void {
    if (this.context && this.context.state === 'running') void this.context.suspend();
  }
}
