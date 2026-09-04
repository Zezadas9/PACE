/**
 * PACE — o que o assistente pode ler.
 *
 * Ecrã próprio, e não uma linha nas definições, porque é a decisão mais
 * importante desta secção. Tudo começa desligado; cada categoria diz em
 * português o que abre; e desligar volta a fechar, sem asteriscos.
 */

import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiDataCategory } from '../../core/types';
import { aiSettings, grantAll, grantedCount, setCategory, setEnabled } from '../../services/coach';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { PageHeader } from '../../ui/page';
import { Card, SectionHeader, Button } from '../../ui/primitives';
import { Switch } from '../../ui/Switch';
import { Rows } from '../../ui/data';

interface CategoryEntry {
  id: AiDataCategory;
  title: string;
  subtitle: string;
}

const CATEGORIES: CategoryEntry[] = [
  { id: 'profile', title: 'Perfil', subtitle: 'Idade, género, altura e peso.' },
  { id: 'goals', title: 'Objetivos', subtitle: 'O que escolheste no perfil.' },
  {
    id: 'training',
    title: 'Treinos',
    subtitle: 'Planos, exercícios, cargas, repetições e RPE.',
  },
  { id: 'activity', title: 'Atividade', subtitle: 'Corrida, caminhada e bicicleta.' },
  { id: 'nutrition', title: 'Alimentação', subtitle: 'Refeições, alimentos e água.' },
  { id: 'habits', title: 'Hábitos', subtitle: 'Hábitos e o que marcaste como feito.' },
  {
    id: 'feedback',
    title: 'Feedback',
    subtitle: 'Dificuldade e notas que escreves no fim das sessões.',
  },
  {
    id: 'sleep',
    title: 'Sono',
    subtitle: 'Ainda não há dados de sono na PACE. Fica preparado para quando houver.',
  },
];

export function ConsentScreen(): ReactElement {
  const { repos, platform } = useApp();
  const feedback = useFeedback();
  const { confirm, toast } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const settings = aiSettings(repos);
  const counts = grantedCount(settings);
  void version;

  const toggleAll = useCallback((enabled: boolean) => {
    setEnabled(repos, enabled);
    feedback.touch();
    if (!enabled) toast('Assistente desligado. Deixa de ler os teus dados.');
  }, [repos, feedback, toast]);

  /**
   * Ligar tudo continua a ser uma decisão, não um atalho silencioso: o diálogo
   * diz o que abre antes de abrir, e qualquer categoria se desliga depois.
   */
  const enableEverything = useCallback(() => {
    void (async () => {
      const ok = await confirm({
        title: 'Dar acesso a tudo?',
        body: 'O assistente passa a ler perfil, objetivos, treinos, atividade, '
          + 'alimentação, hábitos e feedback. Podes desligar qualquer um a seguir.',
        confirmLabel: 'Dar acesso',
      });
      if (!ok) return;
      grantAll(repos);
      feedback.play('complete');
      toast('Acesso dado a todas as categorias.');
    })();
  }, [confirm, repos, feedback, toast]);

  return (
    <Screen>
      <PageHeader
        eyebrow="Assistente"
        title="O que posso ler"
        subtitle="Nada está ligado por omissão. Escolhe tu."
      />

      <Card>
        <Switch
          brand="cadeado"
          checked={settings.enabled}
          title="Assistente ligado"
          subtitle={settings.enabled
            ? 'Lê apenas as categorias que marcares abaixo.'
            : 'Desligado: não lê nada, nem responde com base nos teus dados.'}
          onChange={toggleAll}
        />
      </Card>

      <section>
        <SectionHeader
          title="Categorias"
          actionLabel={counts.on < counts.total ? 'Ativar tudo' : undefined}
          onAction={counts.on < counts.total ? enableEverything : undefined}
        />
        <Card variant="flush">
          <Rows>
            {CATEGORIES.map((category) => (
              <Switch
                key={category.id}
                checked={settings.categories[category.id]}
                disabled={!settings.enabled || category.id === 'sleep'}
                title={category.title}
                subtitle={category.subtitle}
                onChange={(value) => {
                  setCategory(repos, category.id, value);
                  feedback.touch();
                }}
              />
            ))}
          </Rows>
        </Card>
      </section>

      <Card variant="quiet">
        {/* O texto segue o motor que esta instalacao tem, e nao uma promessa
            escrita uma vez. Dizer "nada sai do dispositivo" numa build ligada
            ao Worker seria falso, e e exatamente aqui que nao pode ser. */}
        <p className="t-sm muted">
          {platform.assistant.isRemote()
            ? 'Para responder, as categorias que ligares acima são enviadas ao servidor '
              + 'da PACE, que fala com o modelo. Nada disto é guardado lá: o servidor '
              + 'responde e esquece. Se ficar sem rede, responde o motor que corre no '
              + 'teu telemóvel.'
            : 'Tudo isto acontece no teu telemóvel: o assistente corre localmente e '
              + 'nada é enviado para fora.'}
        </p>
      </Card>

      <Button variant="outline" block label="Voltar à conversa" onClick={() => navigate('/ia')} />
    </Screen>
  );
}
