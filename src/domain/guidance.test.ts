import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_SEC, RUN_DONE_CUE, WARMUP_SEC, afterRestCue, cuesBetween, distanceCues, restCue,
  runGuide, setCue, spokenDistance, spokenDuration, stateAt,
} from './guidance';

const intervalos = {
  kind: 'walk_run' as const,
  segments: [{ runSec: 60, walkSec: 90, repeats: 8 }],
  targetDistanceM: null,
};

describe('como se diz uma duração', () => {
  it('fala como um treinador, e não como um relógio', () => {
    expect(spokenDuration(60)).toBe('1 minuto');
    expect(spokenDuration(90)).toBe('1 minuto e meio');
    expect(spokenDuration(150)).toBe('2 minutos e meio');
    expect(spokenDuration(135)).toBe('2 minutos e 15 segundos');
    expect(spokenDuration(30)).toBe('30 segundos');
    expect(spokenDuration(300)).toBe('5 minutos');
  });

  it('e uma distância, com vírgula e no singular quando é um', () => {
    expect(spokenDistance(1000, 'km')).toBe('1 quilómetro');
    expect(spokenDistance(2500, 'km')).toBe('2,5 quilómetros');
    expect(spokenDistance(1609.344, 'mi')).toBe('1 milha');
  });
});

describe('a corrida por intervalos', () => {
  const fases = runGuide(intervalos);

  it('aquece, corre e recupera, e arrefece — sem recuperação depois da última série', () => {
    // 1 aquecimento + 8 corridas + 7 recuperações + 1 arrefecimento
    expect(fases).toHaveLength(17);
    expect(fases[0]?.kind).toBe('warmup');
    expect(fases[fases.length - 2]?.kind).toBe('run');
    expect(fases[fases.length - 1]?.kind).toBe('cooldown');
  });

  it('no aquecimento diz quantas séries vêm e de que são feitas', () => {
    const aquecimento = fases[0]!;
    expect(aquecimento.cue).toContain('8 séries');
    expect(aquecimento.cue).toContain('1 minuto a correr');
    expect(aquecimento.cue).toContain('1 minuto e meio a caminhar');
    expect(aquecimento.cue).toContain('sem correr');
  });

  it('sabe em que fase se está', () => {
    expect(stateAt(fases, 0)?.phase.kind).toBe('warmup');
    expect(stateAt(fases, WARMUP_SEC)?.phase).toMatchObject({ kind: 'run', series: 1, seriesTotal: 8 });
    expect(stateAt(fases, WARMUP_SEC + 60)?.phase).toMatchObject({ kind: 'walk', series: 1 });
    expect(stateAt(fases, WARMUP_SEC + 30)?.remainingInPhase).toBe(30);

    const total = WARMUP_SEC + 8 * 60 + 7 * 90 + COOLDOWN_SEC;
    expect(stateAt(fases, total - 1)?.done).toBe(false);
    expect(stateAt(fases, total)?.done).toBe(true);
  });

  it('diz a primeira frase ao começar, e cada uma no seu segundo', () => {
    expect(cuesBetween(fases, -1, 0)).toEqual([fases[0]!.cue]);
    expect(cuesBetween(fases, 0, 1)).toEqual([]);

    // O lembrete das séries, um minuto antes de acabar o aquecimento.
    expect(cuesBetween(fases, WARMUP_SEC - 61, WARMUP_SEC - 60)[0]).toContain('Falta 1 minuto');
    expect(cuesBetween(fases, WARMUP_SEC - 1, WARMUP_SEC)).toEqual(['Série 1 de 8. Corre durante 1 minuto.']);

    // Recuperação de 90 s: aviso aos 10 segundos do fim.
    const inicioRecuperacao = WARMUP_SEC + 60;
    expect(cuesBetween(fases, inicioRecuperacao + 79, inicioRecuperacao + 80)).toEqual(['10 segundos.']);
  });

  it('acaba com o arrefecimento e com a frase do fim', () => {
    const fimDaUltimaSerie = WARMUP_SEC + 8 * 60 + 7 * 90;
    expect(cuesBetween(fases, fimDaUltimaSerie - 1, fimDaUltimaSerie)[0]).toContain('Última série feita');
    const total = fimDaUltimaSerie + COOLDOWN_SEC;
    expect(cuesBetween(fases, total - 1, total)).toContain(RUN_DONE_CUE);
  });

  it('quando o relógio salta, devolve tudo o que ficou para trás, por ordem', () => {
    const saltadas = cuesBetween(fases, 0, WARMUP_SEC + 61);
    expect(saltadas.length).toBeGreaterThan(2);
    expect(saltadas[saltadas.length - 1]).toContain('Caminha');
  });
});

describe('a corrida por distância', () => {
  const fases = runGuide({ kind: 'easy_run', segments: [], targetDistanceM: 3000 });

  it('aquece e depois corre sem relógio — quem a fecha é a distância', () => {
    expect(fases.map((fase) => fase.kind)).toEqual(['warmup', 'free']);
    expect(fases[0]!.cue).toContain('3 quilómetros');
    const aCorrer = stateAt(fases, 10_000);
    expect(aCorrer?.phase.kind).toBe('free');
    expect(aCorrer?.remainingInPhase).toBeNull();
    expect(aCorrer?.done).toBe(false);
  });

  it('anuncia cada quilómetro, a metade e a chegada', () => {
    expect(distanceCues(900, 1010, 3000, 'km')).toEqual(['1 quilómetro.']);
    expect(distanceCues(1400, 1600, 3000, 'km')).toEqual(['Metade feita.']);
    const chegada = distanceCues(2950, 3010, 3000, 'km');
    expect(chegada).toHaveLength(1);
    expect(chegada[0]).toContain('Chegaste aos 3 quilómetros');
  });

  it('não diz nada sem distância nova', () => {
    expect(distanceCues(1200, 1200, 3000, 'km')).toEqual([]);
  });

  it('um dia de descanso não tem fases', () => {
    expect(runGuide({ kind: 'rest', segments: [], targetDistanceM: null })).toEqual([]);
  });
});

describe('o treino', () => {
  it('diz o exercício, a série e o alvo', () => {
    expect(setCue({
      exercise: 'Agachamento', section: null, setIndex: 0, setsTotal: 3,
      reps: 12, durationSec: null, loadKg: 20,
    })).toBe('Agachamento. Série 1 de 3: 12 repetições com 20 quilos.');

    expect(setCue({
      exercise: 'Prancha', section: 'Core', setIndex: 1, setsTotal: 3,
      reps: null, durationSec: 45, loadKg: null,
    })).toBe('Core. Prancha. Série 2 de 3: 45 segundos.');

    expect(setCue({
      exercise: 'Supino', section: null, setIndex: 2, setsTotal: 4,
      reps: 8, durationSec: null, loadKg: 42.5,
    })).toContain('42,5 quilos');
  });

  it('e o descanso', () => {
    expect(restCue(90)).toBe('Descansa 1 minuto e meio.');
    expect(afterRestCue({
      exercise: 'Remada', section: null, setIndex: 1, setsTotal: 3,
      reps: 10, durationSec: null, loadKg: null,
    })).toBe('Descanso feito. Remada. Série 2 de 3: 10 repetições.');
  });
});
