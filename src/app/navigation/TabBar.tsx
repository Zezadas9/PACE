/**
 * Bottom navigation.
 *
 * NavLink renders an anchor whose click the router intercepts — it never lets
 * the WebView perform a top-level navigation, which inside a Capacitor shell
 * would tear down the app.
 *
 * Cada separador leva o icone ilustrado que lhe corresponde na folha da marca.
 * O que nao esta ativo fica esbatido, para a barra continuar calma e o sitio
 * onde estas ser o unico a cores.
 */

import { NavLink } from 'react-router-dom';
import type { ReactElement } from 'react';
import { TABS } from '../../core/constants';
import { BrandIcon, type BrandIconName } from '../../ui/BrandIcon';
import { useFeedback } from '../providers/appContext';

export function TabBar(): ReactElement {
  const feedback = useFeedback();

  return (
    <nav className="nav" aria-label="Navegação principal">
      {TABS.map((tab) => (
        <NavLink
          key={tab.id}
          to={tab.path}
          className="nav-item"
          onClick={() => feedback.touch()}
        >
          <BrandIcon name={tab.brand as BrandIconName} size={26} />
          <span className="label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
