/**
 * PACE — a assinatura.
 *
 * Uma semana a experimentar, e depois 5 € por mês. Este ecrã é o único sítio
 * onde se fala de dinheiro, e tem três trabalhos: dizer em que pé está a
 * assinatura, levar ao pagamento, e aceitar um código de quem já pagou.
 *
 * Duas coisas que este ecrã não faz: não pressiona, e não prende. Não há
 * contagens decrescentes ao segundo nem "última oportunidade"; e a cópia de
 * segurança pode ser exportada mesmo com a aplicação bloqueada — os dados são
 * de quem os escreveu, pague ou não pague.
 *
 * O que é código de desconto e o que é chave de compra não se mistura: o
 * desconto vai com o pagamento, a chave repõe um acesso que já existe. Nenhum
 * código está escrito aqui — quem abrir o JavaScript da aplicação não encontra
 * nenhum.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_PATH } from '../../core/constants';
import { longDate } from '../../core/utils/date';
import { exportBackup } from '../../services/backup';
import {
  accessOf, accountStart, redeemCode, startCheckout, syncLicence, trialDaysLeft,
} from '../../services/subscription';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { PageHeader } from '../../ui/page';
import { Button, Card, SectionHeader } from '../../ui/primitives';
import { Field, Input } from '../../ui/form';
import { BrandIcon } from '../../ui/BrandIcon';

const PRICE = '5 € por mês';

/** O título e a frase de cada estado. Uma frase, a mais útil que há para dizer. */
function headline(state: string | null, days: number | null): { title: string; body: string } {
  if (state === 'lifetime') {
    return { title: 'Acesso permanente', body: 'Tens a PACE inteira, para sempre. Obrigado.' };
  }
  if (state === 'paid') {
    return { title: 'Assinatura ativa', body: 'Tens a PACE inteira.' };
  }
  if (state === 'trial') {
    return {
      title: days === 1 ? 'Falta 1 dia de experiência' : `Faltam ${days ?? 0} dias de experiência`,
      body: 'Podes usar tudo. Assinas quando quiseres — e o que escreveste fica.',
    };
  }
  if (state === 'unmanaged') {
    return { title: 'Sem assinatura', body: 'Esta cópia da PACE não tem pagamentos configurados.' };
  }
  return {
    title: 'A experiência acabou',
    body: 'Os teus dados continuam aqui, inteiros, e voltam no instante em que assinares.',
  };
}

export function SubscriptionScreen(): ReactElement {
  const { repos, platform, store } = useApp();
  const version = useStoreVersion();
  const { toast } = useUi();
  const navigate = useNavigate();

  const licence = useMemo(() => repos.settings.get().licence, [repos, version]);
  const days = trialDaysLeft(licence);
  const open = accessOf(licence, accountStart(repos)) === 'open';
  const paid = licence.state === 'paid' || licence.state === 'lifetime';

  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // Uma ida ao servidor sempre que este ecrã abre: é aqui que um pagamento
  // acabado de fazer deixa de ser uma promessa e passa a ser acesso.
  useEffect(() => {
    void syncLicence(repos, platform).catch(() => {});
  }, [repos, platform]);

  const buy = useCallback(() => {
    void (async () => {
      setBusy(true);
      const url = await startCheckout(repos, platform, code);
      setBusy(false);
      if (!url) {
        toast(code
          ? 'Não consegui abrir o pagamento. O código pode não existir.'
          : 'Não consegui abrir o pagamento. Tenta daqui a pouco.', 4000);
        return;
      }
      // Noutro separador: a aplicação fica onde está, e quando voltar já sabe
      // que está paga — o Lemon Squeezy avisa o servidor entretanto.
      if (!window.open(url, '_blank', 'noopener')) window.location.href = url;
    })();
  }, [repos, platform, code, toast]);

  const redeem = useCallback(() => {
    void (async () => {
      setBusy(true);
      const outcome = await redeemCode(repos, platform, code, email);
      setBusy(false);
      if (outcome === 'ok') {
        toast('Acesso reposto.');
        navigate(DEFAULT_PATH);
        return;
      }
      toast({
        invalid: 'Esse código não serve. Confirma se está tal e qual como no email.',
        email: 'Esse email não é o da compra. Usa o que usaste a pagar.',
        offline: 'Sem ligação à internet. Tenta outra vez daqui a pouco.',
      }[outcome], 4000);
    })();
  }, [repos, platform, code, email, navigate, toast]);

  const backup = useCallback(() => {
    const result = exportBackup(store, repos);
    const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [store, repos]);

  const { title, body } = headline(licence.state, days);
  // Sem loja configurada nao ha preco a anunciar nem codigo que sirva: mostrar
  // "5 EUR por mes" a quem nao pode pagar e prometer uma porta que nao existe.
  const selling = licence.state !== 'unmanaged';

  return (
    <Screen>
      <PageHeader eyebrow="Assinatura" title={title} subtitle={body} />

      {selling ? (
      <Card>
        <div className="row" style={{ gap: 'var(--s-4)', alignItems: 'center' }}>
          <BrandIcon name={paid ? 'cadeado' : 'planos'} size={44} float={!paid} />
          <div className="grow">
            <p className="t-h1">{PRICE}</p>
            <p className="t-sm muted">
              {paid
                ? licence.renewsAt
                  ? `Renova a ${longDate(licence.renewsAt.slice(0, 10))}.`
                  : 'Sem data de renovação à vista.'
                : 'Cancelas quando quiseres, e ficas com o que já pagaste até ao fim do mês.'}
            </p>
          </div>
        </div>

        {!paid && licence.canBuy ? (
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Button
              variant="primary"
              block
              disabled={busy}
              label={days != null ? 'Assinar agora' : 'Assinar e voltar ao que era'}
              onClick={buy}
            />
          </div>
        ) : null}

        {!paid && !licence.canBuy && licence.state !== 'unmanaged' ? (
          <p className="t-sm muted-2" style={{ marginTop: 'var(--s-4)' }}>
            A loja ainda não está aberta. Assim que estiver, o botão aparece aqui.
          </p>
        ) : null}

        {paid && licence.portalUrl ? (
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Button
              variant="outline"
              block
              label="Gerir a assinatura"
              onClick={() => window.open(licence.portalUrl as string, '_blank', 'noopener')}
            />
          </div>
        ) : null}
      </Card>
      ) : null}

      {!paid && selling ? (
        <section>
          <SectionHeader title="Tens um código?" />
          <Card>
            <div className="stack stack-4">
              <Field
                label="Código"
                hint="O código de desconto entra no pagamento. A chave que recebeste por email repõe o acesso."
              >
                <Input value={code} placeholder="Escreve aqui" maxLength={64} onChange={setCode} />
              </Field>
              <Field label="Email da compra" hint="Só é preciso para repor o acesso com a chave.">
                <Input value={email} placeholder="o-teu@email.pt" maxLength={120} onChange={setEmail} />
              </Field>
              <Button
                variant="outline"
                block
                disabled={busy || code.trim() === ''}
                label="Repor o meu acesso"
                onClick={redeem}
              />
            </div>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Os teus dados" />
        <Card>
          <p className="t-sm muted">
            Tudo o que escreveste está guardado neste telemóvel e continua teu, com a
            assinatura ativa ou sem ela. Podes levá-lo contigo a qualquer momento.
          </p>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Button variant="ghost" icon="download" label="Exportar cópia de segurança" onClick={backup} />
          </div>
        </Card>
      </section>

      {open ? (
        <Button variant="ghost" block label="Voltar" onClick={() => navigate(DEFAULT_PATH)} />
      ) : null}
    </Screen>
  );
}
