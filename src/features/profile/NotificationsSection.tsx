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
                ? 'Indisponível no browser — fica ativo na aplicação instalada.'
                : permission === 'denied'
                  ? 'Permissão recusada nas definições do sistema.'
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
        </Rows>
      </Card>

      <div style={{ marginTop: 'var(--s-3)' }}>
      <Card>
        <div className="stack stack-4">
          <p className="t-sm muted">
            Nenhum lembrete é enviado fora desta janela, mesmo que um hábito peça
            outra coisa.
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
