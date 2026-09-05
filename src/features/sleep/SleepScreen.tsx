/**
 * O sono.
 *
 * A única secção da PACE onde tudo é escrito à mão — não há aqui medição
 * nenhuma, e o ecrã não finge que há. Enquanto não houver ligação ao Health,
 * isto é um diário: vale pela regularidade de o preencher, não pela precisão
 * dos números.
 *
 * Por isso o formulário é curto e nada é obrigatório. Quem só quer dizer que
 * dormiu mal toca numa palavra e sai.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { mediumDate, todayKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import { RECOMMENDED_MIN, durationOf } from '../../domain/sleep';
import {
  deleteNight, draftFor, hasAnything, overview, saveNight, type SleepDraft,
} from '../../services/sleep';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { Button, Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, Row, Rows } from '../../ui/data';
import { Field, Input } from '../../ui/form';
import { TimeField } from '../../ui/TimeField';
import { PageHeader } from '../../ui/page';
import { AskPace } from '../assistant/AskPace';

/** Cinco graus, com palavras: um número de 1 a 5 não diz o que significa. */
const QUALITY = [
  { value: 1, label: 'Péssima' },
  { value: 2, label: 'Má' },
  { value: 3, label: 'Assim-assim' },
  { value: 4, label: 'Boa' },
  { value: 5, label: 'Ótima' },
];

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** "7h 30m", ou um traço. Nunca "0h" para uma noite que ninguém mediu. */
export function sleepText(minutes: number | null): string {
  return minutes == null ? '—' : format.duration(minutes * 60);
}

export function SleepScreen(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const { confirm, toast } = useUi();
  const version = useStoreVersion();

  const today = todayKey();
  const model = useMemo(() => overview(repos, today), [repos, today, version]);
  const [draft, setDraft] = useState<SleepDraft>(() => draftFor(repos, today));

  const patch = (changes: Partial<SleepDraft>): void => {
    setDraft((current) => ({ ...current, ...changes }));
  };

  const save = useCallback(() => {
    const saved = saveNight(repos, draft);
    if (!saved) { toast('Escreve pelo menos uma coisa sobre a noite.'); return; }
    feedback.play('complete');
    toast('Noite registada.');
  }, [repos, draft, feedback, toast]);

  const remove = useCallback(() => {
    void (async () => {
      const ok = await confirm({
        title: 'Apagar esta noite?', confirmLabel: 'Apagar', danger: true,
      });
      if (!ok) return;
      deleteNight(repos, today);
      setDraft(draftFor(repos, today));
    })();
  }, [confirm, repos, today]);

  const duracao = draft.bedtime && draft.wakeTime
    ? durationOf({ ...draft, id: '', createdAt: '', updatedAt: '', source: 'manual' })
    : draft.durationMin;

  return (
    <Screen>
      <PageHeader
        eyebrow="Descanso"
        title="Sono"
        subtitle="Como dormiste esta noite."
      />

      <Card>
        <div className="grid-2">
          <Field label="Deitei-me">
            <TimeField
              ariaLabel="Hora a que te deitaste"
              value={draft.bedtime ?? ''}
              onChange={(value) => patch({ bedtime: value || null })}
            />
          </Field>
          <Field label="Acordei">
            <TimeField
              ariaLabel="Hora a que acordaste"
              value={draft.wakeTime ?? ''}
              onChange={(value) => patch({ wakeTime: value || null })}
            />
          </Field>
        </div>

        {draft.bedtime && draft.wakeTime ? (
          <p className="t-sm muted" style={{ marginTop: 'var(--s-3)' }}>
            {duracao == null
              ? 'Essas horas não fazem uma noite. Confere-as.'
              : `Dormiste ${sleepText(duracao)}.`}
          </p>
        ) : (
          <Field label="Ou só as horas que dormiste" hint="Se não souberes a que horas adormeceste.">
            <Input
              type="number"
              inputMode="decimal"
              unit="h"
              value={draft.durationMin == null ? '' : Math.round((draft.durationMin / 60) * 10) / 10}
              min={0}
              max={16}
              step={0.5}
              onChange={(value) => {
                const horas = toNumber(value);
                patch({ durationMin: horas == null ? null : Math.round(horas * 60) });
              }}
            />
          </Field>
        )}
      </Card>

      <Field label="Como foi a noite">
        <div className="chips">
          {QUALITY.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={draft.quality === option.value}
              onClick={() => patch({
                quality: draft.quality === option.value ? null : option.value,
              })}
            >
              <span className="dot" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid-2">
        <Field label="Acordei durante a noite" hint="Quantas vezes.">
          <Input
            type="number"
            inputMode="numeric"
            value={draft.awakenings ?? ''}
            min={0}
            max={20}
            onChange={(value) => patch({ awakenings: toNumber(value) })}
          />
        </Field>
        <Field label="Notas">
          <Input
            value={draft.notes ?? ''}
            placeholder="Ex.: barulho na rua"
            maxLength={120}
            onChange={(value) => patch({ notes: value || null })}
          />
        </Field>
      </div>

      <div className="live-actions">
        {model.today ? (
          <Button variant="outline" block label="Apagar" onClick={remove} />
        ) : null}
        <Button
          variant="primary"
          block
          label={model.today ? 'Atualizar' : 'Registar'}
          onClick={save}
          disabled={!hasAnything(draft)}
        />
      </div>

      {model.week.nights > 0 ? (
        <section>
          <SectionHeader title="Últimos 7 dias" />
          <Card variant="quiet">
            <div className="grid-2">
              <Metric label="Média por noite" value={sleepText(model.week.averageMin)} />
              <Metric
                label="Noites registadas"
                value={`${model.week.nights}`}
                suffix="de 7"
              />
              <Metric
                label="Noites de 7h ou mais"
                value={`${model.week.goodNights}`}
                suffix={model.week.measured > 0 ? `de ${model.week.measured}` : undefined}
              />
              <Metric
                label="Qualidade média"
                value={model.week.averageQuality == null
                  ? '—'
                  : `${format.number(model.week.averageQuality, 1)}`}
                suffix={model.week.averageQuality == null ? undefined : 'de 5'}
              />
            </div>

            {model.week.bedtimeSpreadMin != null ? (
              <p className="t-sm muted-2" style={{ marginTop: 'var(--s-3)' }}>
                {model.week.bedtimeSpreadMin <= 60
                  ? 'Deitas-te sempre à mesma hora, com menos de uma hora de diferença.'
                  : `A tua hora de deitar varia ${format.duration(model.week.bedtimeSpreadMin * 60)}. `
                    + 'A regularidade conta tanto como o total.'}
              </p>
            ) : null}

            {model.week.measured < model.week.nights ? (
              <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>
                A média só conta as {model.week.measured} noites com horas registadas.
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Histórico" />
        {model.recent.length === 0 ? (
          <EmptyState
            brand="sono"
            title="Ainda sem noites"
            body="Regista a primeira acima. Ao fim de uma semana já dá para ver um padrão."
          />
        ) : (
          <Card variant="flush">
            <Rows>
              {model.recent.map((entry) => {
                const minutos = durationOf(entry);
                return (
                  <Row
                    key={entry.id}
                    brand="sono"
                    title={mediumDate(entry.date)}
                    sub={[
                      entry.bedtime && entry.wakeTime ? `${entry.bedtime} — ${entry.wakeTime}` : null,
                      entry.quality != null
                        ? QUALITY.find((q) => q.value === entry.quality)?.label ?? null
                        : null,
                      entry.awakenings ? `${entry.awakenings}× acordado` : null,
                    ].filter(Boolean).join(' · ') || 'Sem detalhes'}
                    trail={sleepText(minutos)}
                    data-good={minutos != null && minutos >= RECOMMENDED_MIN ? 'true' : undefined}
                  />
                );
              })}
            </Rows>
          </Card>
        )}
      </section>

      <Card variant="quiet">
        <p className="t-sm muted">
          Isto é um diário, não uma medição: os números são os que escreves. Quando a
          PACE tiver ligação ao Health ou ao Health Connect, passa a ler as noites
          sozinha — e a categoria já está no ecrã de autorizações à espera disso.
        </p>
      </Card>

      <AskPace questions={[
        'Como tenho dormido?',
        'Cria-me uma rotina de sono',
        'O meu sono está a afetar os treinos?',
      ]} />
    </Screen>
  );
}
