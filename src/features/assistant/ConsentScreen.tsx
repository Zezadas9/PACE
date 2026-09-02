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
import { aiSettings, setCategory, setEnabled } from '../../services/coach';
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
  const { repos } = useApp();
  const feedback = useFeedback();
  const { toast } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const settings = aiSettings(repos);
  void version;

  const toggleAll = useCallback((enabled: boolean) => {
    setEnabled(repos, enabled);
    feedback.touch();
    if (!enabled) toast('Assistente desligado. Deixa de ler os teus dados.');
  }, [repos, feedback, toast]);

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
        <SectionHeader title="Categorias" />
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
        <p className="t-sm muted">
          Tudo isto acontece no teu telemóvel: o assistente corre localmente e nada é
          enviado para fora. Se um dia existir um modelo na nuvem, será uma escolha
          separada e explícita — não um detalhe que muda por baixo.
        </p>
      </Card>

      <Button variant="outline" block label="Voltar à conversa" onClick={() => navigate('/ia')} />
    </Screen>
  );
}
