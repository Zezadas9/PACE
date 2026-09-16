import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS, MAX_TOTAL_CHARS, describePending, kindOf, labelFor, limitProblem,
  type PendingAttachment,
} from './attachment';

const parte = (tamanho = 10): PendingAttachment['parts'][number] => ({
  kind: 'image', mediaType: 'image/jpeg', data: 'A'.repeat(tamanho), name: null, origin: 'photo', frame: null,
});

describe('o que aparece no ecrã', () => {
  it('uma foto ou um vídeo não mostram o nome do ficheiro', () => {
    expect(labelFor('photo', 'IMG_4821.PNG')).toBe('Foto');
    expect(labelFor('video', 'VID_20260916.mp4')).toBe('Vídeo');
  });

  it('um documento mostra, porque o nome diz o que ele é', () => {
    expect(labelFor('file', 'horario.pdf')).toBe('horario.pdf');
    expect(labelFor('file', '  ')).toBe('Ficheiro');
  });

  it('o resumo da conversa conta fotos e vídeos e nomeia os ficheiros', () => {
    expect(describePending([{ kind: 'photo', label: 'Foto' }])).toBe('1 foto');
    expect(describePending([
      { kind: 'photo', label: 'Foto' },
      { kind: 'photo', label: 'Foto' },
      { kind: 'video', label: 'Vídeo' },
      { kind: 'file', label: 'horario.pdf' },
    ])).toBe('2 fotos, 1 vídeo e horario.pdf');
    expect(describePending([])).toBe('');
  });
});

describe('que ficheiros se aceitam', () => {
  it('a galeria inteira, PDFs e texto', () => {
    expect(kindOf('image/heic', 'IMG.HEIC')).toBe('photo');
    expect(kindOf('video/quicktime', 'IMG.MOV')).toBe('video');
    expect(kindOf('application/pdf', 'x.pdf')).toBe('file');
    expect(kindOf('text/csv', 'turnos.csv')).toBe('file');
  });

  it('um CSV sem tipo, como alguns telemóveis o entregam, também', () => {
    expect(kindOf('', 'turnos.csv')).toBe('file');
    expect(kindOf('application/vnd.ms-excel', 'turnos.CSV')).toBe('file');
  });

  it('o resto não', () => {
    expect(kindOf('application/zip', 'coisas.zip')).toBeNull();
    expect(kindOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')).toBeNull();
  });
});

describe('limites', () => {
  it('deixa passar o que cabe', () => {
    expect(limitProblem([{ parts: [parte()] }, { parts: [parte(), parte()] }])).toBeNull();
  });

  it('recusa coisas a mais, partes a mais, ou tamanho a mais', () => {
    expect(limitProblem(Array.from({ length: MAX_ITEMS + 1 }, () => ({ parts: [parte()] }))))
      .toContain('coisas de cada vez');
    // Quatro vídeos de quatro fotogramas são dezasseis partes.
    expect(limitProblem(Array.from({ length: 4 }, () => ({ parts: [parte(), parte(), parte(), parte()] }))))
      .toContain('demasiado');
    expect(limitProblem([{ parts: [parte(MAX_TOTAL_CHARS + 1)] }])).toContain('grandes de mais');
  });
});
