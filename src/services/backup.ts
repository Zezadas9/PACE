/**
 * PACE — copia de seguranca.
 *
 * A aplicacao guarda tudo numa unica chave de armazenamento, num unico
 * telemovel. Nao ha conta nem sincronizacao, o que quer dizer que uma limpeza
 * de dados do browser, um telemovel novo, ou o sistema a libertar espaco de uma
 * app que nao se abre ha uns dias levam meses de historico com eles.
 *
 * Isto e o que impede esse fim. Duas operacoes e nada mais: escrever um
 * ficheiro que o utilizador guarda onde quiser, e voltar a le-lo.
 *
 * O formato e o snapshot tal e qual — o mesmo objeto que ja e escrito no
 * armazenamento e o mesmo que uma sincronizacao futura enviaria. Nao ha aqui um
 * formato de exportacao proprio para manter em dia: ha um so, e as migracoes
 * que ja existem tratam de o ler quando for antigo.
 */

import { APP } from '../core/constants';
import type { Store } from '../data/store';
import type { Repositories } from '../data/repositories';

/** O que se sabe sobre a ultima copia feita. */
export interface BackupState {
  /** Quando foi, em ISO, ou null se nunca. */
  lastAt: string | null;
  /** Dias desde a ultima, para o ecra poder insistir sem ser chato. */
  daysSince: number | null;
  /** Quantos registos a copia levaria agora. */
  records: number;
}

const COLLECTIONS = [
  'goals', 'habits', 'habitEntries', 'tasks', 'events', 'exercises', 'workouts',
  'workoutSessions', 'activitySessions', 'activityGoals', 'foods', 'meals',
  'mealPlans', 'nutritionGoals', 'waterEntries', 'runPlans', 'coachMessages', 'streaks',
] as const;

export function backupState(store: Store, repos: Repositories): BackupState {
  const lastAt = repos.settings.get().backup?.lastExportAt ?? null;
  const snapshot = store.snapshot as unknown as Record<string, unknown[]>;

  return {
    lastAt,
    daysSince: lastAt == null
      ? null
      : Math.floor((Date.now() - new Date(lastAt).getTime()) / 86_400_000),
    records: COLLECTIONS.reduce(
      (total, key) => total + (Array.isArray(snapshot[key]) ? snapshot[key].length : 0),
      0,
    ),
  };
}

/** O nome do ficheiro traz a data: duas copias nunca se sobrepoem. */
export function backupFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `pace-${stamp}.json`;
}

export interface ExportResult {
  filename: string;
  json: string;
  bytes: number;
}

/**
 * Prepara a copia e regista que foi feita.
 *
 * O registo da data e o que permite ao ecra dizer "ha 40 dias que nao fazes
 * copia" — uma copia que a pessoa se esquece de fazer nao e copia nenhuma.
 */
export function exportBackup(store: Store, repos: Repositories): ExportResult {
  const json = store.exportJson();
  repos.settings.updateBackup({ lastExportAt: new Date().toISOString() });
  return {
    filename: backupFilename(),
    json,
    bytes: new Blob([json]).size,
  };
}

export type ImportProblem = 'unreadable' | 'not_pace' | 'too_new' | 'write_failed';

export interface ImportPreview {
  ok: true;
  /** Quantos registos entram, para a confirmacao poder ser especifica. */
  records: number;
  /** De que versao da aplicacao veio, quando o ficheiro o diz. */
  appVersion: string | null;
  savedAt: string | null;
  name: string | null;
}

/**
 * Le um ficheiro sem o aplicar.
 *
 * Substituir os dados de alguem e irreversivel, e uma confirmacao so vale
 * alguma coisa se disser o que vai entrar. Por isso a leitura vem antes da
 * escrita, e e ela que alimenta o dialogo.
 */
export function inspectBackup(json: string): ImportPreview | { ok: false; problem: ImportProblem } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, problem: 'unreadable' };
  }

  if (!parsed || typeof parsed !== 'object') return { ok: false, problem: 'unreadable' };
  const snapshot = parsed as Record<string, unknown>;

  // Um ficheiro da PACE tem sempre estes tres. Sem eles e outra coisa qualquer
  // com a extensao certa.
  if (typeof snapshot.schemaVersion !== 'number' || !('settings' in snapshot)) {
    return { ok: false, problem: 'not_pace' };
  }
  // De uma versao futura nao se sabe ler: as migracoes so andam para a frente.
  if (snapshot.schemaVersion > APP.schemaVersion) return { ok: false, problem: 'too_new' };

  const user = snapshot.user as { name?: unknown } | null;

  return {
    ok: true,
    records: COLLECTIONS.reduce(
      (total, key) => total + (Array.isArray(snapshot[key]) ? (snapshot[key] as unknown[]).length : 0),
      0,
    ),
    appVersion: typeof snapshot.appVersion === 'string' ? snapshot.appVersion : null,
    savedAt: typeof snapshot.savedAt === 'string' ? snapshot.savedAt : null,
    name: user && typeof user.name === 'string' ? user.name : null,
  };
}

/** Aplica a copia. Substitui tudo — quem chama ja perguntou. */
export async function restoreBackup(store: Store, json: string): Promise<boolean> {
  try {
    return await store.importJson(json);
  } catch {
    return false;
  }
}
