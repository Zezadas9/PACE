/**
 * Notification settings.
 *
 * The master switch, the quiet-hours window, and an honest account of what is
 * actually scheduled. On the web the port reports itself unavailable, so the
 * section says so rather than pretending reminders will arrive.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { PermissionState } from '../../platform/types';
import { previewPlan, setEnabled, syncReminders } from '../../services/notifications';
import { syncStreakReminder, type StreakReminderStatus } from '../../services/streakReminder';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Field } from '../../ui/form';
import { TimeField } from '../../ui/TimeField';
import { Row, Rows } from '../../ui/data';
import { Switch } from '../../ui/Switch';

/**
 * O que dizer por baixo do lembrete da sequencia.
 *
 * Cada causa tem a sua frase, porque cada uma pede outra coisa a quem a le: no
 * iPhone e instalar no ecra principal, sem permissao e ir as definicoes, sem
 * servidor nao ha nada a fazer deste lado.
 */
function streakSubtitle(
  enabled: boolean,
  on: boolean,
  time: string,
  state: StreakReminderStatus | null,
): string {
  if (!enabled) return 'Liga os lembretes acima para este também poder sair.';
  if (!on) return 'Desligado.';
  switch (state) {
    case 'unsupported':
      return 'No iPhone, só chega com a PACE no ecrã principal (iOS 16.4 ou mais recente).';
    case 'denied':
      return 'Sem permissão para notificações. Tens de a dar nas definições do sistema.';
    case 'not-configured':
      return 'O servidor ainda não tem os avisos configurados.';
    case 'failed':
      return 'Não consegui falar com o servidor. Tento outra vez quando abrires a aplicação.';
    default:
      return `Todos os dias às ${time}, só se o dia ainda não estiver fechado.`;
  }
}

export function NotificationsSection(): ReactElement {
  const { repos, platform } = useApp();
  const { toast } = useUi();
  const version = useStoreVersion();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');

  const settings = repos.settings.get().notifications;
  const [streakState, setStreakState] = useState<StreakReminderStatus | null>(null);

  // O estado real do lembrete, e nao o que o interruptor diz: ligado mas sem
  // o telemovel o suportar e uma coisa diferente de ligado e a funcionar.
  useEffect(() => {
    let cancelled = false;
    void syncStreakReminder(repos, platform)
      .then((state) => { if (!cancelled) setStreakState(state); })
      .catch(() => { if (!cancelled) setStreakState('failed'); });
    return () => { cancelled = true; };
  }, [repos, platform, settings.enabled, settings.streakReminder, settings.streakReminderTime]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [can, state] = await Promise.all([
        platform.notifications.isAvailable(),
        platform.notifications.checkPermission(),
      ]);
      if (cancelled) return;
      setAvailable(can);
      setPermission(state);
    })();
    return () => { cancelled = true; };
  }, [platform]);

  const plan = useMemo(
    () => previewPlan(repos, settings),
    [repos, settings, version],
  );

  /** Proof it works, which is worth more than any explanation. */
  const test = async (): Promise<void> => {
    const state = await platform.notifications.requestPermission();
    setPermission(state);
    if (state !== 'granted') {
      toast('Permissão de notificações não concedida.', 3600);
      return;
    }
    await platform.notifications.schedule({
      id: 999_999,
      title: 'PACE',
      body: 'As notificações estão a funcionar.',
      at: new Date(Date.now() + 1000),
      repeats: null,
      route: '/hoje',
    });
    toast('Aviso enviado.');
  };

  const toggle = async (enabled: boolean): Promise<void> => {
    const state = await setEnabled(repos, platform, enabled);
    setPermission(state);
    if (enabled && state !== 'granted') {
      toast(
        state === 'unavailable'
          ? 'Esta plataforma não suporta notificações locais.'
          : 'Permissão de notificações recusada.',
        3600,
      );
      return;
    }
    if (enabled) {
      const result = await syncReminders(repos, platform);
      toast(`${result.scheduled} lembretes agendados.`);
    }
  };

  return (
    <section>
      <SectionHeader title="Notificações" />
      <Card variant="flush">
        <Rows>
          <Switch
            checked={settings.enabled}
            disabled={available === false}
            title="Lembretes locais"
            subtitle={
              available === false
                ? 'Este browser não suporta notificações.'
                : permission === 'denied'
                  ? 'Permissão recusada. Tens de a repor nas definições do sistema.'
                  : 'Avisos de hábitos, eventos e tarefas.'
            }
            onChange={(next) => void toggle(next)}
          />
          <Row
            brand="lembretes"
            title="Agendados"
            sub={
              settings.enabled
                ? `${plan.reminders.length} nos próximos dias${plan.truncated ? ' (limitado)' : ''}`
                : 'Nenhum — os lembretes estão desligados'
            }
          />
          <Row
            brand="relogio"
            title="Testar agora"
            sub="Envia um aviso já, para confirmares que chegam"
            chevron
            onClick={() => void test()}
          />
          <Switch
            checked={settings.enabled && settings.streakReminder}
            disabled={!settings.enabled}
            title="Não perder a sequência"
            subtitle={streakSubtitle(
              settings.enabled, settings.streakReminder, settings.streakReminderTime, streakState,
            )}
            onChange={(next) => repos.settings.update({ streakReminder: next })}
          />
        </Rows>
      </Card>

      <div style={{ marginTop: 'var(--s-3)' }}>
      <Card>
        <div className="stack stack-4">
          <p className="t-sm muted">
            Nenhum lembrete é enviado fora desta janela, mesmo que um hábito peça
            outra coisa.
          </p>
          <p className="t-sm muted-2">
            Nesta versão web, os avisos dos hábitos chegam enquanto a aplicação
            estiver aberta ou tiver sido aberta há pouco. O da sequência é
            diferente: chega mesmo com a aplicação fechada.
          </p>
          <div className="grid-2">
            <Field label="A partir das">
              <TimeField
                value={settings.startTime}
                onChange={(value) => repos.settings.update({ startTime: value })}
              />
            </Field>
            <Field label="Até às">
              <TimeField
                value={settings.endTime}
                onChange={(value) => repos.settings.update({ endTime: value })}
              />
            </Field>
          </div>
          {settings.enabled && settings.streakReminder ? (
            <Field
              label="Lembrete da sequência às"
              hint="Não segue a janela acima: é um aviso só, e só se o dia não fechou."
            >
              <TimeField
                value={settings.streakReminderTime}
                ariaLabel="Hora do lembrete da sequência"
                onChange={(value) => repos.settings.update({ streakReminderTime: value })}
              />
            </Field>
          ) : null}
        </div>
      </Card>
      </div>
    </section>
  );
}
