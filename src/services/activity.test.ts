import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import { createUser } from '../core/factories';
import type { StoragePort } from '../platform/types';
import {
  emptyManualEntry, entryFromSession, evolution, finishSession,
  saveManual, startSession,
} from './activity';
import { essentialsForDay } from '../domain/progress';
import { dayAgenda, progressDataset } from './agenda';

/** Armazenamento em memória: os testes não tocam em disco nem em localStorage. */
function memoryStorage(): StoragePort {
  const map = new Map<string, unknown>();
  return {
    name: 'memory',
    isAvailable: async () => true,
    get: async <T,>(key: string) => (map.get(key) as T) ?? null,
    set: async (key, value) => { map.set(key, value); },
    remove: async (key) => { map.delete(key); },
    keys: async () => [...map.keys()],
  };
}

let repos: Repositories;

beforeEach(async () => {
  const store = new Store(memoryStorage());
  await store.load();
  repos = createRepositories(store);
});

function withWeight(kg: number | null): void {
  const user = createUser({ name: 'Teste' });
  repos.user.set({ ...user, body: { ...user.body, weightKg: kg } });
}

describe('finishSession', () => {
  it('estima calorias quando o utilizador não escreveu nenhumas', () => {
    withWeight(70);
    const session = startSession(repos, 'run');
    repos.activitySessions.update(session.id, {
      startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });

    const done = finishSession(repos, session.id);
    expect(done?.caloriesSource).toBe('estimated');
    expect(done?.calories).toBeGreaterThan(0);
  });

  it('não estima nada sem peso no perfil', () => {
    withWeight(null);
    const session = startSession(repos, 'run');
    repos.activitySessions.update(session.id, {
      startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });

    const done = finishSession(repos, session.id);
    expect(done?.calories).toBeNull();
    expect(done?.caloriesSource).toBeNull();
  });

  it('respeita as calorias escritas à mão e marca-as como manuais', () => {
    withWeight(70);
    const session = startSession(repos, 'run');
    const done = finishSession(repos, session.id, { calories: 412 });
    expect(done?.calories).toBe(412);
    expect(done?.caloriesSource).toBe('manual');
  });

  it('guarda o esforço percebido e o desconforto', () => {
    const session = startSession(repos, 'run');
    const done = finishSession(repos, session.id, {
      perceivedEffort: 8,
      difficulty: 'hard',
      discomfort: 'joelho direito',
    });
    expect(done?.perceivedEffort).toBe(8);
    expect(done?.difficulty).toBe('hard');
    expect(done?.discomfort).toBe('joelho direito');
  });

  it('aceita a distância escrita quando não houve percurso', () => {
    const session = startSession(repos, 'run');
    const done = finishSession(repos, session.id, { distanceM: 5000 });
    expect(done?.distanceM).toBe(5000);
  });
});

describe('registo manual', () => {
  it('estima calorias também no registo manual', () => {
    withWeight(70);
    const saved = saveManual(repos, {
      ...emptyManualEntry('2026-08-30'),
      durationSec: 3600,
      distanceM: 8000,
    });
    expect(saved.caloriesSource).toBe('estimated');
  });

  it('não devolve uma estimativa ao formulário como se fosse escrita', () => {
    withWeight(70);
    const saved = saveManual(repos, {
      ...emptyManualEntry('2026-08-30'),
      durationSec: 3600,
      distanceM: 8000,
    });
    expect(entryFromSession(saved).calories).toBeNull();
  });

  it('devolve ao formulário as calorias que o utilizador escreveu', () => {
    const saved = saveManual(repos, {
      ...emptyManualEntry('2026-08-30'),
      durationSec: 3600,
      calories: 500,
    });
    expect(entryFromSession(saved).calories).toBe(500);
  });

  it('deriva o ritmo em vez de o pedir', () => {
    const saved = saveManual(repos, {
      ...emptyManualEntry('2026-08-30'),
      durationSec: 1500,
      distanceM: 5000,
    });
    expect(saved.avgPaceSecPerKm).toBe(300);
  });

  it('guarda a atividade como essencial quando pedido', () => {
    const saved = saveManual(repos, {
      ...emptyManualEntry('2026-08-30'),
      durationSec: 1800,
      essential: true,
    });
    expect(saved.essential).toBe(true);
  });
});

describe('evolution', () => {
  it('compara com a janela anterior do mesmo tamanho', () => {
    saveManual(repos, {
      ...emptyManualEntry('2026-08-30'), durationSec: 1800, distanceM: 5000,
    });
    saveManual(repos, {
      ...emptyManualEntry('2026-07-20'), durationSec: 1800, distanceM: 3000,
    });

    const model = evolution(repos, '30d', null, '2026-08-31');
    expect(model.summary.sessions).toBe(1);
    expect(model.summary.distanceM).toBe(5000);
    expect(model.previous.sessions).toBe(1);
  });

  it('filtra por tipo de atividade', () => {
    saveManual(repos, {
      ...emptyManualEntry('2026-08-30'), type: 'run', durationSec: 1800, distanceM: 5000,
    });
    saveManual(repos, {
      ...emptyManualEntry('2026-08-30'), type: 'ride', durationSec: 1800, distanceM: 20000,
    });

    expect(evolution(repos, '30d', 'run', '2026-08-31').summary.distanceM).toBe(5000);
  });
});

describe('integração com o dia perfeito', () => {
  it('uma atividade essencial terminada conta como feita', () => {
    saveManual(repos, {
      ...emptyManualEntry('2026-08-30'), durationSec: 1800, essential: true,
    });
    const essentials = essentialsForDay(progressDataset(repos), '2026-08-30');
    expect(essentials).toHaveLength(1);
    expect(essentials[0]?.kind).toBe('activity');
    expect(essentials[0]?.done).toBe(true);
  });

  it('uma atividade a decorrer conta como por fazer', () => {
    const session = startSession(repos, 'run', '2026-08-30');
    repos.activitySessions.update(session.id, { essential: true });
    const essentials = essentialsForDay(progressDataset(repos), '2026-08-30');
    expect(essentials[0]?.done).toBe(false);
  });

  it('uma atividade não essencial não entra na conta do dia', () => {
    saveManual(repos, { ...emptyManualEntry('2026-08-30'), durationSec: 1800 });
    expect(essentialsForDay(progressDataset(repos), '2026-08-30')).toHaveLength(0);
  });

  it('aparece na agenda do dia', () => {
    saveManual(repos, { ...emptyManualEntry('2026-08-30'), durationSec: 1800 });
    const day = dayAgenda(repos, '2026-08-30');
    const item = [...day.timed, ...day.untimed].find((entry) => entry.kind === 'activity');
    expect(item?.title).toBe('Corrida');
    expect(item?.done).toBe(true);
  });
});
