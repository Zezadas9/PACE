/**
 * A voz que guia as sessões.
 *
 * Usa a síntese de voz do próprio telemóvel, que funciona sem rede e sem
 * servidor nenhum. Escolhe uma voz de Portugal quando o aparelho a tem; senão,
 * qualquer voz portuguesa; senão, a que houver, com a língua pedida.
 *
 * O iPhone só deixa uma página falar depois de um toque. Por isso existe
 * `unlock()`, que tem de ser chamado dentro do toque que começa a sessão —
 * sem isso, a primeira frase (a do aquecimento) sairia muda, e as seguintes
 * também.
 *
 * O que isto não consegue: falar com o ecrã bloqueado. O iOS suspende a página
 * e a voz com ela. A versão nativa resolve isso; aqui, o ecrã da sessão pede
 * ao sistema para não adormecer enquanto ela decorre.
 */

import type { VoicePort } from '../types';

const LANG = 'pt-PT';

export class WebVoicePort implements VoicePort {
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (!this.supported()) return;
    this.pick();
    // As vozes chegam depois do arranque em quase todos os browsers.
    window.speechSynthesis.addEventListener('voiceschanged', () => this.pick());
  }

  supported(): boolean {
    return typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  private pick(): void {
    const voices = window.speechSynthesis.getVoices();
    this.voice = voices.find((voice) => voice.lang.replace('_', '-') === LANG)
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('pt'))
      ?? null;
  }

  unlock(): void {
    if (!this.supported()) return;
    // Uma frase muda, dita dentro do toque, abre a porta às que vêm depois.
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }

  speak(text: string, options: { interrupt?: boolean } = {}): void {
    if (!this.supported() || text.trim() === '') return;
    const synth = window.speechSynthesis;
    if (options.interrupt) synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.voice?.lang.replace('_', '-') ?? LANG;
    if (this.voice) utterance.voice = this.voice;
    utterance.rate = 1;

    // O Chrome deixa a fila em pausa quando a página perde o foco.
    if (synth.paused) synth.resume();
    synth.speak(utterance);
  }

  cancel(): void {
    if (this.supported()) window.speechSynthesis.cancel();
  }
}
