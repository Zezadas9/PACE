import { describe, expect, it } from 'vitest';
import { isCompleteTime, maskTime } from './TimeField';

describe('maskTime', () => {
  it('põe os dois pontos ao segundo dígito', () => {
    expect(maskTime('0')).toBe('0');
    expect(maskTime('08')).toBe('08');
    expect(maskTime('083')).toBe('08:3');
    expect(maskTime('0830')).toBe('08:30');
  });

  it('não deixa passar dos quatro dígitos', () => {
    expect(maskTime('0830123')).toBe('08:30');
  });

  it('ignora o que não é número', () => {
    expect(maskTime('8h30')).toBe('08:30');
    expect(maskTime('ab')).toBe('');
  });

  it('lê um digito de hora quando os dois primeiros nao podem ser uma hora', () => {
    expect(maskTime('930')).toBe('09:30');
    expect(maskTime('9999')).toBe('09:59');
  });

  it('trava minutos impossiveis', () => {
    expect(maskTime('2378')).toBe('23:59');
  });

  it('aceita continuar a escrever depois de apagar', () => {
    expect(maskTime('08:3')).toBe('08:3');
    expect(maskTime('08:')).toBe('08');
  });
});

describe('isCompleteTime', () => {
  it('só aceita uma hora inteira', () => {
    expect(isCompleteTime('08:30')).toBe(true);
    expect(isCompleteTime('23:59')).toBe(true);
    expect(isCompleteTime('08:3')).toBe(false);
    expect(isCompleteTime('24:00')).toBe(false);
    expect(isCompleteTime('')).toBe(false);
  });
});
