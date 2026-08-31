/**
 * Registers the service worker in production only.
 *
 * Skipped in development, where a cached shell would hide the changes you just
 * made, and skipped on insecure origins, where the browser refuses anyway —
 * which includes reaching the dev server by LAN IP from a phone.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      // Relative, so it works from a repository subpath on GitHub Pages.
      .register('./sw.js', { scope: './', updateViaCache: 'none' })
      .catch(() => {
        // Offline support is a bonus; failing to register is not an app error.
      });
  });
}
