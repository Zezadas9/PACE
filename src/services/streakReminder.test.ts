import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepositories, type Repositories } from '../data/repositories';
import { Store } from '../data/store';
import { todayKey } from '../core/utils/date';
import type { ClockTime } from '../core/types';
import type { Platform, PushPort, PushState, StoragePort } from '../platform/types';
import { forgetStreakReminderSession, syncStreakReminder } from './streakReminder';

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

function fakePush(supported = true) {
  return {
    supported: vi.fn(() => supported),
    enable: vi.fn(async (_input: { id: string; time: string; timezone: string }): Promise<PushState> => 'ok'),
    reportDay: vi.fn(async (_input: { id: string; date: string; closed: boolean }) => true),
    disable: vi.fn(async (_id: string) => {}),
  } satisfies PushPort;
}

const platformWith = (push: PushPort): Platform => ({ push }) as unknown as Platform;

let repos: Repositories;

beforeEach(async () => {
  const store = new Store(memoryStorage());
  await store.load();
  repos = createRepositories(store);
  forgetStreakReminderSession();
});

describe('lembrete da sequência', () => {
  it('não faz nada com as notificações desligadas', async () => {
    const push = fakePush();
    expect(await syncStreakReminder(repos, platformWith(push))).toBe('off');
    expect(push.enable).not.toHaveBeenCalled();
  });

  it('liga uma vez, e não volta a pedir o mesmo a cada alteração', async () => {
    repos.settings.update({ enabled: true });
    const push = fakePush();

    expect(await syncStreakReminder(repos, platformWith(push))).toBe('ok');
    await syncStreakReminder(repos, platformWith(push));

    expect(push.enable).toHaveBeenCalledTimes(1);
    expect(push.enable.mock.calls[0]?.[0]).toMatchObject({ time: '20:00' });
    expect(push.reportDay).toHaveBeenCalledTimes(1);
    // Um identificador opaco, guardado para as próximas vezes.
    expect(repos.settings.get().notifications.pushId).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('diz ao servidor quando o dia fecha — é isso que cala o aviso', async () => {
    repos.settings.update({ enabled: true });
    const today = todayKey();
    const habit = repos.habits.create({ title: 'Água', essential: true, startDate: today });
    const push = fakePush();

    await syncStreakReminder(repos, platformWith(push), today);
    expect(push.reportDay).toHaveBeenLastCalledWith(expect.objectContaining({ date: today, closed: false }));

    repos.habitEntries.create({ habitId: habit.id, date: today, completed: true, value: 1 });
    await syncStreakReminder(repos, platformWith(push), today);
    expect(push.reportDay).toHaveBeenLastCalledWith(expect.objectContaining({ date: today, closed: true }));
  });

  it('num telemóvel sem push diz porquê, e não tenta', async () => {
    repos.settings.update({ enabled: true });
    const push = fakePush(false);
    expect(await syncStreakReminder(repos, platformWith(push))).toBe('unsupported');
    expect(push.enable).not.toHaveBeenCalled();
  });

  it('uma hora a meio de ser escrita não vai para o servidor', async () => {
    repos.settings.update({ enabled: true, streakReminderTime: '20:' as ClockTime });
    const push = fakePush();
    expect(await syncStreakReminder(repos, platformWith(push))).toBe('failed');
    expect(push.enable).not.toHaveBeenCalled();
  });

  it('desligar faz o servidor esquecer este aparelho', async () => {
    repos.settings.update({ enabled: true });
    const push = fakePush();
    await syncStreakReminder(repos, platformWith(push));
    const id = repos.settings.get().notifications.pushId;

    repos.settings.update({ streakReminder: false });
    expect(await syncStreakReminder(repos, platformWith(push))).toBe('off');
    expect(push.disable).toHaveBeenCalledWith(id);
  });
});
