/**
 * O aviso de que a experiência está a acabar.
 *
 * Aparece nos últimos três dias, e não antes: uma contagem decrescente ligada
 * desde o primeiro dia transforma uma semana a experimentar numa semana a ser
 * cobrada. E some-se assim que a assinatura existir.
 *
 * Diz o que falta e o que custa, e mais nada. Sem "última oportunidade", sem
 * vermelho: quem quiser continuar, continua; quem não quiser, leva os dados.
 */

import { useMemo, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUBSCRIPTION_PATH } from '../../core/constants';
import { trialDaysLeft } from '../../services/subscription';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { Card } from '../../ui/primitives';

/** A partir de quantos dias a faltar é que vale a pena dizer alguma coisa. */
const WARN_DAYS = 3;

export function TrialNotice(): ReactElement | null {
  const { repos } = useApp();
  const version = useStoreVersion();
  const navigate = useNavigate();

  const licence = useMemo(() => repos.settings.get().licence, [repos, version]);
  const days = trialDaysLeft(licence);
  if (days == null || days > WARN_DAYS) return null;

  return (
    <Card onClick={() => navigate(SUBSCRIPTION_PATH)}>
      <div className="row row-between">
        <div className="grow">
          <p className="t-eyebrow">Experiência</p>
          <p className="t-h1" style={{ marginTop: '0.25rem' }}>
            {days === 0 ? 'Acaba hoje' : days === 1 ? 'Falta 1 dia' : `Faltam ${days} dias`}
          </p>
          <p className="t-sm muted">
            Depois são 5 € por mês. O que escreveste fica, assines ou não.
          </p>
        </div>
        <span className="today-cta">Ver</span>
      </div>
    </Card>
  );
}
