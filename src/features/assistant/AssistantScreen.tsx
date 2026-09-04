/**
 * PACE — a conversa com o assistente.
 *
 * Parece um chat, mas não é um chatbot: as respostas trazem propostas com
 * botão. É essa a diferença entre "podias fazer X" e X feito, com uma
 * confirmação pelo meio.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CoachAction, CoachTurn , ScheduleDraft } from '../../domain/coach/types';
import {
  aiSettings, applyAction, ask, clearHistory, history, runPlanView,
} from '../../services/coach';
import {
  useApp, useFeedback, usePreferences, useStoreVersion,
} from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { BrandIcon } from '../../ui/BrandIcon';
import { SchedulePlanSheet } from './SchedulePlanSheet';
import { Button, Card } from '../../ui/primitives';
import { Icon } from '../../ui/Icon';
import { Blocks } from './blocks';
import { ActionCard } from './ActionCard';

const STARTERS = [
  'O que faço hoje?',
  'Cria-me um treino de pernas de 45 minutos',
  'Este treino está equilibrado?',
  'Quero conseguir correr 10 km',
  'Quero caminhar mais',
  'Sinto-me cansado, o que faço?',
  'Como durmo melhor?',
  'Quero alongar mais',
  'Tenho consumido pouca proteína?',
  'Sugere ideias de refeições',
  'Sugere hábitos para melhorar a condição física',
  'Organiza a minha semana',
];

export function AssistantScreen(): ReactElement {
  const { repos, platform } = useApp();
  const preferences = usePreferences();
  const feedback = useFeedback();
  const { confirm, toast } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();

  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(() => searchParams.get('pergunta') ?? '');
  const [busy, setBusy] = useState(false);
  /**
   * O que correu mal da última vez, e o que se tinha escrito.
   *
   * Guarda-se a mensagem para o botão "Tentar outra vez" não obrigar ninguém a
   * escrever tudo de novo.
   */
  const [notice, setNotice] = useState<{ text: string; retry: string | null } | null>(null);
  /** A proposta de semana aberta para rever — aceitar, editar ou rejeitar. */
  const [schedule, setSchedule] = useState<ScheduleDraft | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const settings = useMemo(() => aiSettings(repos), [repos, version]);
  const messages = useMemo(() => history(repos), [repos, version]);
  const plan = useMemo(() => runPlanView(repos), [repos, version]);

  const lastTurn = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.role === 'coach');
    return (last?.turn ?? null) as CoachTurn | null;
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  /**
   * Uma pergunta trazida de outro ecrã ("Perguntar à PACE") entra no campo,
   * escrita mas por enviar: quem chega aqui ainda a pode mudar antes de a
   * fazer. O parâmetro é consumido de imediato para não voltar num refresh.
   */
  useEffect(() => {
    if (!searchParams.has('pergunta')) return;
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setDraft('');
    setBusy(true);
    setNotice(null);
    try {
      const result = await ask(repos, platform, preferences, message);
      feedback.touch();
      // Quando o backend falha, a resposta local sai à mesma — mas convém
      // dizê-lo, sem alarme e sem esconder.
      setNotice(result.fallback
        ? {
          text: 'Não cheguei ao assistente online. Esta resposta veio do motor que corre '
            + 'no telemóvel, que sabe menos e pode ter percebido mal o pedido.',
          retry: message,
        }
        : null);
    } catch {
      setNotice({
        text: 'Não consegui responder agora. Tenta outra vez daqui a pouco.',
        retry: message,
      });
    } finally {
      setBusy(false);
    }
  }, [repos, platform, preferences, feedback, busy]);

  const run = useCallback((action: CoachAction) => {
    void (async () => {
      if (action.kind === 'open') {
        navigate(action.path);
        return;
      }
      // A proposta de semana não cabe num "confirmas?": abre-se para ser lida,
      // mudada linha a linha, e só depois aceite.
      if (action.kind === 'apply_schedule') {
        setSchedule(action.draft);
        return;
      }
      const ok = await confirm({
        title: action.label,
        body: 'Confirmas? Isto escreve na tua aplicação — e nada mais é alterado.',
        confirmLabel: 'Confirmar',
      });
      if (!ok) return;

      const result = applyAction(repos, action);
      if (!result.ok) {
        toast(result.message || 'Não consegui aplicar isso.');
        return;
      }
      feedback.play('complete');
      toast(result.message);
    })();
  }, [repos, confirm, feedback, toast, navigate]);

  return (
    <Screen>
      <header className="coach-head">
        <BrandIcon name="ia" size={44} float />
        <div className="grow">
          <p className="t-eyebrow">Assistente</p>
          <h1 className="t-title">Treinador</h1>
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label="O que posso ler"
          onClick={() => navigate('/ia/dados')}
        >
          <Icon name="lock" />
        </button>
      </header>

      {!settings.enabled ? (
        <Card>
          <p className="t-h2">Está desligado</p>
          <p className="t-sm muted" style={{ margin: '0.4rem 0 1rem' }}>
            Sem autorização não leio nada — nem treinos, nem refeições, nem o teu perfil.
            Escolhes tu o que fica acessível, e podes desligar a qualquer momento.
          </p>
          <Button variant="primary" block label="Escolher o que posso ler"
            onClick={() => navigate('/ia/dados')} />
        </Card>
      ) : null}

      {plan ? (
        <Card onClick={() => navigate('/ia/corrida')}>
          <div className="row row-between">
            <div className="grow">
              <p className="t-eyebrow">Plano de corrida</p>
              <p className="t-h2" style={{ marginTop: '0.25rem' }}>{plan.plan.title}</p>
              <p className="t-sm muted">
                {plan.doneCount} de {plan.total} sessões
                {plan.next ? ` · a seguir ${plan.next.date.slice(8)}/${plan.next.date.slice(5, 7)}` : ''}
              </p>
            </div>
            <span className="today-cta">Ver</span>
          </div>
        </Card>
      ) : null}

      <div className="coach-thread">
        {messages.length === 0 ? (
          <div className="coach-empty">
            <p className="t-h2">Pergunta-me qualquer coisa.</p>
            <p className="t-sm muted">
              Leio os teus dados, faço as contas e proponho — sempre com a fonte à vista,
              e sem inventar o que não sei.
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          message.role === 'user' ? (
            <div key={message.id} className="coach-bubble">{message.text}</div>
          ) : (
            <div key={message.id} className="coach-turn">
              <Blocks blocks={(message.turn as CoachTurn | null)?.blocks ?? []} />
              {((message.turn as CoachTurn | null)?.actions ?? []).map((action, index) => (
                <ActionCard key={index} action={action} onRun={run} busy={busy} />
              ))}
            </div>
          )
        ))}

        {busy ? <div className="coach-typing"><span /><span /><span /></div> : null}

        {notice ? (
          <div className="coach-notice-line" role="status">
            <span>{notice.text}</span>
            {notice.retry ? (
              <button
                type="button"
                className="link"
                onClick={() => { const again = notice.retry; setNotice(null); if (again) void send(again); }}
              >
                Tentar outra vez
              </button>
            ) : null}
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <div className="coach-suggestions">
        {(lastTurn?.followUps?.length ? lastTurn.followUps : STARTERS).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="chip"
            onClick={() => void send(suggestion)}
          >
            <span className="dot" />
            <span>{suggestion}</span>
          </button>
        ))}
      </div>

      <form
        className="coach-composer"
        onSubmit={(event) => { event.preventDefault(); void send(draft); }}
      >
        <input
          className="input"
          value={draft}
          placeholder="Escreve aqui…"
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Mensagem"
        />
        <button type="submit" className="btn-icon" aria-label="Enviar" disabled={busy}>
          <Icon name="chevron" />
        </button>
      </form>

      {messages.length > 0 ? (
        <button
          type="button"
          className="coach-clear t-sm muted-2"
          onClick={() => void (async () => {
            const ok = await confirm({
              title: 'Apagar a conversa?', confirmLabel: 'Apagar', danger: true,
            });
            if (ok) clearHistory(repos);
          })()}
        >
          Apagar conversa
        </button>
      ) : null}
      {schedule ? (
        <SchedulePlanSheet
          draft={schedule}
          onClose={() => setSchedule(null)}
          onConfirm={(edited) => {
            const result = applyAction(repos, {
              kind: 'apply_schedule',
              label: 'Confirmar',
              draft: edited,
            });
            setSchedule(null);
            if (!result.ok) {
              toast(result.message || 'Não consegui aplicar isso.');
              return;
            }
            feedback.play('complete');
            toast(result.message);
          }}
        />
      ) : null}
    </Screen>
  );
}
