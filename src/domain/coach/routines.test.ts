import { describe, expect, it } from 'vitest';
import { createSettings, createUser } from '../../core/factories';
import { respond } from './index';
import { parseIntent } from './intent';
import type { CoachContext } from './types';
import { ballPreference, buildSportSession, sportFor } from './sports';
import { bedtimeFrom } from './topics';

function context(): CoachContext {
  const user = createUser({ name: 'T' });
  return {
    today: '2026-09-05',
    settings: { ...createSettings().ai, enabled: true, categories: {
      profile: true, goals: true, training: true, activity: true,
      nutrition: true, habits: true, sleep: false, feedback: true,
    } },
    preferences: user.preferences,
    profile: null,
    goals: [], workouts: [], exercises: [], sessions: [], activities: [],
    habits: [], habitEntries: [], meals: [], foods: [], water: [],
    runPlan: null, sleep: null,
  };
}

const firstText = (turn: ReturnType<typeof respond>): string => {
  const block = turn.blocks[0];
  return block && 'text' in block ? block.text : '';
};

describe('sessões de desporto', () => {
  it('reconhece a modalidade pelo nome', () => {
    expect(sportFor('treino de futebol').id).toBe('football');
    expect(sportFor('treino de basquete').id).toBe('basketball');
    expect(sportFor('treino de tenis').id).toBe('racket');
    expect(sportFor('treino de voleibol').id).toBe('volleyball');
    // Uma modalidade que não está na lista não fica sem sessão.
    expect(sportFor('treino de andebol').id).toBe('general');
  });

  it('traz as duas partes: com bola e sem bola', () => {
    const session = buildSportSession('futebol', 90);
    expect(session.withBallMin).toBeGreaterThan(0);
    expect(session.withoutBallMin).toBeGreaterThan(0);
    expect(session.blocks.some((block) => block.withBall)).toBe(true);
    expect(session.blocks.some((block) => !block.withBall)).toBe(true);
  });

  it('dá só a bola a quem pede só a bola', () => {
    const quer = ballPreference('treino de futebol só com bola');
    expect(quer).toEqual({ ball: true, physical: false });
    const session = buildSportSession('futebol', 60, quer);
    expect(session.withoutBallMin).toBe(0);
    // O aquecimento e o retorno à calma ficam sempre: são sem bola por natureza.
    expect(session.blocks.filter((b) => b.section === 'main').every((b) => b.withBall)).toBe(true);
  });

  it('dá só a parte física a quem pede sem bola', () => {
    const quer = ballPreference('treino de futebol sem bola');
    expect(quer).toEqual({ ball: false, physical: true });
    expect(buildSportSession('futebol', 60, quer).withBallMin).toBe(0);
  });

  it('acompanha a duração pedida', () => {
    for (const minutos of [45, 60, 90, 120]) {
      const session = buildSportSession('futebol', minutos);
      expect(Math.abs(session.minutes - minutos)).toBeLessThanOrEqual(12);
    }
  });

  it('começa sempre por aquecer e acaba por arrefecer', () => {
    const session = buildSportSession('futebol', 90);
    expect(session.blocks[0]?.section).toBe('warmup');
    expect(session.blocks[session.blocks.length - 1]?.section).toBe('cardio');
  });
});

describe('rotina de sono', () => {
  it('lê a hora de deitar da mensagem', () => {
    expect(bedtimeFrom('Cria-me uma rotina de sono para me deitar às 22:30')).toBe('22:30');
    expect(bedtimeFrom('quero deitar-me às 23h')).toBe('23:00');
    expect(bedtimeFrom('Cria-me uma rotina de sono')).toBe('23:00');
  });

  it('devolve uma sequência com horas, não uma lista de conselhos', () => {
    const turn = respond(context(), 'Cria-me uma rotina de sono para me deitar às 22:30');
    expect(firstText(turn)).toContain('22:30');

    const passos = turn.blocks.find((block) => block.kind === 'list');
    expect(passos && 'items' in passos ? passos.items.length : 0).toBe(6);

    const accao = turn.actions.find((action) => action.kind === 'create_habits');
    expect(accao && 'drafts' in accao ? accao.drafts.length : 0).toBe(6);
  });

  it('pendura as horas todas na hora de deitar', () => {
    const turn = respond(context(), 'rotina de sono, deitar às 22:00');
    const accao = turn.actions.find((action) => action.kind === 'create_habits');
    const horas = accao && 'drafts' in accao ? accao.drafts.map((d) => d.timeOfDay) : [];
    // Oito horas antes de deitar para a cafeína, e oito depois para acordar.
    expect(horas).toContain('14:00');
    expect(horas).toContain('22:00');
    expect(horas).toContain('06:00');
  });
});

describe('rotina de alongamentos', () => {
  it('não vai parar à organização da semana por causa de um número', () => {
    expect(parseIntent('Cria-me uma rotina de alongamentos de 20 minutos').kind)
      .toBe('stretching');
  });

  it('dura o que foi pedido', () => {
    const turn = respond(context(), 'Cria-me uma rotina de alongamentos de 20 minutos');
    expect(firstText(turn)).toContain('20 minutos');
  });
});

describe('a IA monta o desporto pedido', () => {
  it('futebol deixa de ser um treino de ginásio com outro nome', () => {
    const turn = respond(context(), 'Cria-me uma rotina de futebol com bola e sem bola');
    expect(firstText(turn)).toContain('Futebol');
    expect(firstText(turn)).toContain('com bola');

    const accao = turn.actions.find((action) => action.kind === 'create_workout');
    const nomes = accao && 'draft' in accao ? accao.draft.blocks.map((b) => b.exerciseName) : [];
    expect(nomes).toContain('Condução em slalom');
    expect(nomes).not.toContain('Supino plano');
  });

  it('uma modalidade sem biblioteca própria continua a ter sessão', () => {
    const turn = respond(context(), 'Cria-me um treino de andebol de 60 minutos');
    expect(turn.actions.some((action) => action.kind === 'create_workout')).toBe(true);
  });
});
