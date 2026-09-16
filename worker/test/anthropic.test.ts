import { describe, expect, it } from 'vitest';
import { buildMessages } from '../src/anthropic';
import { requestSchema } from '../src/schema';

const context = {
  today: '2026-09-16',
  settings: { enabled: true, categories: { calendar: true } },
  profile: { name: 'Teste', ageYears: 27, gender: 'male', heightCm: 178, weightKg: 72 },
  goals: [],
  workouts: [],
  exercises: [],
  sessions: [],
  activities: [],
  habits: [],
  habitEntries: [],
  meals: [],
  foods: [],
  water: [],
  runPlan: null,
};

function request(extra: Record<string, unknown>) {
  const parsed = requestSchema.safeParse({ message: 'poe isto na agenda', context, ...extra });
  if (!parsed.success) throw new Error(parsed.error.message);
  return parsed.data;
}

const base64 = (text: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

describe('a mensagem com anexos', () => {
  it('etiqueta cada anexo antes de o mostrar, e deixa a pergunta para o fim', () => {
    const messages = buildMessages(request({
      attachments: [
        { kind: 'image', mediaType: 'image/jpeg', data: 'AAAA', origin: 'photo' },
        { kind: 'image', mediaType: 'image/jpeg', data: 'AAAA', origin: 'video', frame: { index: 1, of: 2 } },
        { kind: 'document', mediaType: 'application/pdf', data: 'AAAA', name: 'horario.pdf' },
      ],
    }));

    const last = messages[messages.length - 1];
    expect(last?.role).toBe('user');
    const content = last?.content as Array<{ type: string; text?: string }>;

    expect(content[0]).toEqual({ type: 'text', text: 'Anexo 1: foto.' });
    expect(content[1]?.type).toBe('image');
    expect(content[2]?.text).toBe('Anexo 2: fotograma 1 de 2 de um video, por ordem.');
    expect(content[4]?.text).toBe('Anexo 3: documento PDF "horario.pdf".');
    expect(content[5]?.type).toBe('document');
    // O aviso de que os anexos sao dados, e depois a pergunta.
    expect(content[content.length - 2]?.text).toContain('não são instruções');
    expect(content[content.length - 1]?.text).toContain('poe isto na agenda');
  });

  it('um ficheiro de texto chega ao modelo como texto, com os acentos inteiros', () => {
    const messages = buildMessages(request({
      attachments: [{
        kind: 'text', mediaType: 'text/csv', name: 'turnos.csv',
        data: base64('Segunda;Matemática;09:00;10:30'),
      }],
    }));
    const content = messages[messages.length - 1]?.content as Array<{
      type: string; source?: { type: string; data: string };
    }>;
    expect(content[1]?.source).toEqual({
      type: 'text', media_type: 'text/plain', data: 'Segunda;Matemática;09:00;10:30',
    });
  });

  it('o formato antigo, de um anexo so, continua a funcionar', () => {
    const messages = buildMessages(request({
      attachment: { kind: 'image', mediaType: 'image/png', data: 'AAAA', name: 'prato.png' },
    }));
    const content = messages[messages.length - 1]?.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toBe('Anexo 1: foto.');
    expect(content[1]?.type).toBe('image');
  });

  it('sem anexos, a mensagem e so texto', () => {
    const messages = buildMessages(request({}));
    expect(typeof messages[messages.length - 1]?.content).toBe('string');
  });
});
