/**
 * Cópia de segurança.
 *
 * A PACE guarda tudo num só sítio, num só telemóvel. Sem isto, uma limpeza de
 * dados do browser ou um telemóvel novo levam meses de histórico com eles — e
 * essa é a única falha da aplicação que não tem volta.
 *
 * Por isso a secção não é discreta: diz há quanto tempo foi a última cópia, e
 * insiste quando já vai longe. Um botão que ninguém vê não faz cópias.
 */

import { useRef, useState, type ReactElement } from 'react';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { backupState, exportBackup, inspectBackup, restoreBackup } from '../../services/backup';
import { mediumDate } from '../../core/utils/date';
import { Card, SectionHeader } from '../../ui/primitives';
import { Row, Rows } from '../../ui/data';

/** Ao fim disto, o ecrã deixa de ser informativo e passa a insistir. */
const STALE_DAYS = 30;

const PROBLEMS: Record<string, string> = {
  unreadable: 'Não consegui ler esse ficheiro.',
  not_pace: 'Esse ficheiro não é uma cópia da PACE.',
  too_new: 'Essa cópia vem de uma versão mais recente da PACE. Atualiza a aplicação primeiro.',
  write_failed: 'Não consegui guardar. O armazenamento pode estar cheio.',
};

export function BackupSection(): ReactElement {
  const { store, repos } = useApp();
  const { confirm, toast } = useUi();
  const version = useStoreVersion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const state = backupState(store, repos);
  void version;

  const save = (): void => {
    const backup = exportBackup(store, repos);
    // Um Blob e um link temporário: é o que funciona em todos os browsers e
    // não depende de nenhuma permissão.
    const url = URL.createObjectURL(new Blob([backup.json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = backup.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revogar já libertaria o ficheiro antes de o browser o escrever.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(`Cópia guardada (${Math.round(backup.bytes / 1024)} KB).`);
  };

  const load = (file: File): void => {
    void (async () => {
      setBusy(true);
      try {
        const json = await file.text();
        const preview = inspectBackup(json);
        if (!preview.ok) {
          toast(PROBLEMS[preview.problem] ?? 'Não consegui usar esse ficheiro.');
          return;
        }

        const quando = preview.savedAt ? mediumDate(preview.savedAt.slice(0, 10)) : null;
        const ok = await confirm({
          title: 'Substituir tudo por esta cópia?',
          body: `A cópia tem ${preview.records} registos`
            + `${preview.name ? ` de ${preview.name}` : ''}`
            + `${quando ? `, guardados a ${quando}` : ''}. `
            + 'Tudo o que está agora na aplicação é apagado, e isso não tem volta.',
          confirmLabel: 'Substituir',
          danger: true,
        });
        if (!ok) return;

        const written = await restoreBackup(store, json);
        if (!written) { toast(PROBLEMS.write_failed!); return; }
        toast('Cópia restaurada.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const stale = state.daysSince == null || state.daysSince >= STALE_DAYS;

  return (
    <section>
      <SectionHeader title="Cópia de segurança" />
      <Card variant="flush">
        <Rows>
          <Row
            icon="download"
            title="Guardar uma cópia"
            sub={
              state.lastAt == null
                ? `${state.records} registos. Ainda nunca fizeste uma cópia.`
                : state.daysSince === 0
                  ? `${state.records} registos. A última foi hoje.`
                  : `${state.records} registos. A última foi há ${state.daysSince} dias.`
            }
            chevron
            onClick={save}
          />
          <Row
            icon="upload"
            title="Restaurar de uma cópia"
            sub="Substitui tudo o que está na aplicação"
            chevron
            onClick={() => { if (!busy) fileRef.current?.click(); }}
          />
        </Rows>
      </Card>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) load(file);
        }}
      />

      <p className="t-sm muted-2" style={{ marginTop: '0.75rem' }}>
        {stale
          ? 'Os teus dados vivem só neste telemóvel. Guarda a cópia onde não a percas '
            + '— no email, na nuvem, num computador.'
          : 'Guarda o ficheiro fora do telemóvel: uma cópia que fica no mesmo sítio '
            + 'desaparece com ele.'}
      </p>
    </section>
  );
}
