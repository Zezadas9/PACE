/**
 * Campo de hora, com máscara.
 *
 * Escreves dois dígitos e os dois pontos aparecem sozinhos; a partir daí só
 * entram mais dois. Sem isto, uma pessoa escreve "830" e a agenda fica com uma
 * hora que não existe — e ninguém devia ter de escrever pontuação para marcar
 * um treino.
 *
 * Apagar funciona ao contrário do esperado se os dois pontos ficarem colados:
 * ao apagar sobre eles, saem os dois pontos e o dígito antes deles de uma vez,
 * que é o que o dedo estava a tentar fazer.
 */

import { useCallback, type ReactElement } from 'react';

/** Só os dígitos, no máximo quatro: HHMM. */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

/**
 * Formata enquanto se escreve, sem nunca impedir de continuar.
 *
 * As horas acima de 23 e os minutos acima de 59 são fixados no limite em vez de
 * recusados: escrever "9" para as 9h passa por um "9" que ainda não é hora
 * nenhuma, e recusá-lo tornava o campo impossível de usar.
 */
export function maskTime(value: string): string {
  const digits = digitsOf(value);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;

  // "830" é oito e meia, não vinte e três: quando os dois primeiros dígitos não
  // podem ser uma hora, o primeiro é a hora sozinho e o resto são minutos. É o
  // que as pessoas escrevem quando têm pressa.
  const firstTwo = Number(digits.slice(0, 2));
  const splitsEarly = firstTwo > 23;
  const hours = splitsEarly ? Number(digits.slice(0, 1)) : Math.min(23, firstTwo);
  const minutes = digits.slice(splitsEarly ? 1 : 2, splitsEarly ? 3 : 4);

  const clamped = minutes.length === 2
    ? String(Math.min(59, Number(minutes))).padStart(2, '0')
    : minutes;
  return `${String(hours).padStart(2, '0')}:${clamped}`;
}

/** Verdadeiro quando o campo tem uma hora inteira e válida. */
export function isCompleteTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function TimeField({
  value, onChange, placeholder = '08:00', id, ariaLabel, invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  invalid?: boolean;
}): ReactElement {
  const handle = useCallback((next: string) => {
    onChange(maskTime(next));
  }, [onChange]);

  return (
    <input
      id={id}
      className="input"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      maxLength={5}
      onChange={(event) => handle(event.target.value)}
      onKeyDown={(event) => {
        // Apagar por cima dos dois pontos leva também o dígito anterior.
        if (event.key !== 'Backspace') return;
        const input = event.currentTarget;
        if (input.selectionStart !== input.selectionEnd) return;
        if (input.selectionStart !== 3 || !value.includes(':')) return;
        event.preventDefault();
        handle(value.slice(0, 1));
      }}
    />
  );
}
