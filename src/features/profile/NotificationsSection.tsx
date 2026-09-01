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
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Field, Input } from '../../ui/form';
import { Row, Rows } from '../../ui/data';
import { Switch } from '../../ui/Switch';

export function NotificationsSection(): ReactElement {
  const { repos, platform } = useApp();
  const { toast } = useUi();
  const version = useStoreVersion();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');

  const settings = repos.settings.get().notifications;

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
            icon="bell"
            title="Agendados"
            sub={
              settings.enabled
                ? `${plan.reminders.length} nos próximos dias${plan.truncated ? ' (limitado)' : ''}`
                : 'Nenhum — os lembretes estão desligados'
            }
          />
          <Row
            icon="clock"
            title="Testar agora"
            sub="Envia um aviso já, para confirmares que chegam"
            chevron
            onClick={() => void test()}
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
            Nesta versão web, os avisos chegam enquanto a aplicação estiver
            aberta ou tiver sido aberta há pouco. Para avisos com a aplicação
            fechada é preciso a versão nativa.
          </p>
          <div className="grid-2">
            <Field label="A partir das">
              <Input
                type="text"
                inputMode="numeric"
                value={settings.startTime}
                maxLength={5}
                onChange={(value) => repos.settings.update({ startTime: value })}
              />
            </Field>
            <Field label="Até às">
              <Input
                type="text"
                inputMode="numeric"
                value={settings.endTime}
                maxLength={5}
                onChange={(value) => repos.settings.update({ endTime: value })}
              />
            </Field>
          </div>
        </div>
      </Card>
      </div>
    </section>
  );
}
