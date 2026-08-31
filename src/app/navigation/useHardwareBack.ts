/**
 * Android hardware back button.
 *
 * Inert on the web (the port returns a no-op unsubscribe) and fully wired the
 * moment the Capacitor device port is registered — no screen has to know.
 *
 * On a root tab the button should minimise the app rather than navigate; that
 * decision belongs here, not in a screen.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_PATH, TABS } from '../../core/constants';
import { usePlatform } from '../providers/appContext';

export function useHardwareBack(): void {
  const platform = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    return platform.device.onBackButton(() => {
      const isRootTab = TABS.some((tab) => tab.path === location.pathname);
      if (!isRootTab) {
        navigate(-1);
        return;
      }
      if (location.pathname !== DEFAULT_PATH) {
        navigate(DEFAULT_PATH, { replace: true });
        return;
      }
      // On the first tab, the platform decides — minimise rather than exit.
      void platform.background.runWhileBackgrounded(async () => {});
    });
  }, [platform, navigate, location.pathname]);
}
