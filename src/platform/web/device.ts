/** Web device port. Everything the browser can honestly answer. */

import { APP } from '../../core/constants';
import type { DeviceInfo, DevicePort } from '../types';

export class WebDevicePort implements DevicePort {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getInfo(): Promise<DeviceInfo> {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari exposes this instead of the media query.
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return {
      platform: 'web',
      isNative: false,
      isStandalone: standalone,
      model: null,
      osVersion: null,
      appVersion: APP.version,
    };
  }

  /**
   * No hardware back button in a browser. The native port wires
   * `@capacitor/app`'s backButton event to the same handler, so the router
   * needs no branch.
   */
  onBackButton(): () => void {
    return () => {};
  }

  onAppStateChange(handler: (state: 'active' | 'background') => void): () => void {
    const onVisibility = (): void => {
      handler(document.visibilityState === 'hidden' ? 'background' : 'active');
    };
    const onHide = (): void => handler('background');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }

  async setStatusBarStyle(style: 'light' | 'dark'): Promise<void> {
    // The closest web equivalent: keep the theme-color meta in step so the
    // browser UI matches. Native replaces this with the StatusBar plugin.
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', style === 'dark' ? '#0D0E11' : '#F7F6F3');
  }

  async hideSplashScreen(): Promise<void> {
    /* no native splash on the web */
  }

  async haptic(style: 'light' | 'medium' | 'heavy' | 'success'): Promise<void> {
    if (!('vibrate' in navigator)) return;
    // Chrome refuses (and logs) a vibrate before the page has been tapped.
    // Asking first keeps the console honest about real problems.
    const activation = (navigator as Navigator & {
      userActivation?: { hasBeenActive: boolean };
    }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    const pattern = { light: 10, medium: 20, heavy: 35, success: [10, 40, 10] }[style];
    try {
      navigator.vibrate(pattern);
    } catch {
      /* user agent refused; nothing to recover */
    }
  }
}
