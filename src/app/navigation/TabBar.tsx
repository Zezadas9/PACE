/**
 * Bottom navigation.
 *
 * NavLink renders an anchor whose click the router intercepts — it never lets
 * the WebView perform a top-level navigation, which inside a Capacitor shell
 * would tear down the app.
 */

import { NavLink } from 'react-router-dom';
import type { ReactElement } from 'react';
import { TABS } from '../../core/constants';
import { Icon, type IconName } from '../../ui/Icon';
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
          <Icon name={tab.icon as IconName} />
          <span className="label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
