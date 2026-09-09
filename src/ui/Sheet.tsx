/**
 * Bottom sheet.
 *
 * The app's one modal surface for anything longer than a confirmation: create
 * pickers and entry forms. Native-safe by construction — no browser dialog, and
 * the body scrolls inside the sheet so the iOS keyboard cannot push the whole
 * page around.
 */

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({
  title, subtitle, onClose, children, footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}): ReactElement {
  const panel = useRef<HTMLDivElement>(null);

  /*
   * O foco entra na folha uma vez, e uma vez so.
   *
   * Isto estava junto com o resto do efeito, que depende de `onClose`. Como
   * quase todos os ecras passam um `onClose` escrito no proprio JSX, ele muda
   * de identidade a cada render — e o formulario re-renderiza a cada tecla,
   * porque e o ecra que guarda o rascunho. O efeito voltava a correr, o foco
   * saltava do campo para o painel, e no telemovel isso fecha o teclado.
   *
   * A cada letra. Em todos os formularios da aplicacao.
   */
  useEffect(() => {
    panel.current?.focus();
  }, []);

  /*
   * O `onClose` guardado, para o efeito abaixo nao depender dele.
   *
   * A alternativa era pedir a cada ecra que envolvesse o seu `onClose` num
   * `useCallback`. Sao dezenas de sitios, basta um esquecimento para o defeito
   * voltar, e o esquecimento nao da erro nenhum — so um teclado que fecha.
   * Fica resolvido aqui, uma vez.
   */
  const fechar = useRef(onClose);
  fechar.current = onClose;

  /*
   * O Escape e o bloqueio do scroll, montados uma vez.
   *
   * Isto dependia de `onClose`, e quase todos os ecras passam um `onClose`
   * escrito no proprio JSX — muda de identidade a cada render, e o formulario
   * re-renderiza a cada tecla, porque e o ecra que guarda o rascunho. A cada
   * letra, portanto, `document.body.style.overflow` era reposto e voltava a
   * ser `hidden`. No computador nao se nota; no iPhone essa mexida no scroll
   * do documento fecha o teclado por baixo dos pes de quem esta a escrever.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') fechar.current();
    };
    document.addEventListener('keydown', onKeyDown);
    // A pagina por tras nao pode rolar enquanto a folha esta aberta.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <div className="grow">
            <h2 className="t-h1" id="sheet-title">{title}</h2>
            {subtitle ? <p className="t-sm muted-2">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
