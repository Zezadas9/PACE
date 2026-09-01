/**
 * Web notifications.
 *
 * What the web can honestly do, and no more:
 *
 *   - ask for permission (iOS grants it only to an app added to the home
 *     screen, which is exactly how PACE is installed);
 *   - show a notification through the service worker registration, so it looks
 *     and behaves like a real one rather than a browser popup;
 *   - fire reminders on a timer while the app is open, re-arming every time it
 *     is opened.
 *
 * What it cannot do is wake a closed app. There is no scheduling API on the
 * web, and a service worker is killed within seconds of going idle. Reminders
 * therefore arrive for the horizon the app was last open for; a truly
 * background-scheduled reminder needs the native shell, which is what
 * `platform/capacitor/` will provide.
 *
 * This is stated plainly in the settings screen rather than hidden, because a
 * reminder the user believes in and does not get is worse than none.
 */

import type {
  NotificationsPort, PermissionState, ScheduledNotification,
} from '../types';

/** Timers only survive while the page does, so the horizon is deliberately short. */
const MAX_TIMER_MS = 30 * 60 * 1000;

interface Pending {
  notification: ScheduledNotification;
  timer: number | null;
}

export class WebNotificationsPort implements NotificationsPort {
  private pending = new Map<number, Pending>();
  private tapHandlers = new Set<(route: string | null) => void>();
  private listening = false;

  async isAvailable(): Promise<boolean> {
    return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
  }

  async checkPermission(): Promise<PermissionState> {
    if (typeof Notification === 'undefined') return 'unavailable';
    const state = Notification.permission;
    return state === 'default' ? 'prompt' : (state as PermissionState);
  }

  async requestPermission(): Promise<PermissionState> {
    if (typeof Notification === 'undefined') return 'unavailable';
    try {
      const result = await Notification.requestPermission();
      return result === 'default' ? 'prompt' : (result as PermissionState);
    } catch {
      return 'denied';
    }
  }

  async schedule(notification: ScheduledNotification): Promise<void> {
    if ((await this.checkPermission()) !== 'granted') return;

    this.cancelTimer(notification.id);
    const delay = notification.at.getTime() - Date.now();

    // Anything already due fires now; anything beyond the horizon is kept in
    // the list but not armed, and gets picked up on the next replan.
    if (delay <= 0) {
      await this.show(notification);
      return;
    }

    const timer = delay <= MAX_TIMER_MS
      ? window.setTimeout(() => { void this.show(notification); }, delay)
      : null;

    this.pending.set(notification.id, { notification, timer });
  }

  private async show(notification: ScheduledNotification): Promise<void> {
    this.pending.delete(notification.id);
    this.listen();

    const registration = await navigator.serviceWorker?.getRegistration();
    const options: NotificationOptions = {
      body: notification.body,
      tag: String(notification.id),
      icon: './apple-touch-icon.png',
      badge: './apple-touch-icon.png',
      data: { route: notification.route ?? null },
    };

    if (registration) {
      await registration.showNotification(notification.title, options);
      return;
    }
    // No worker (a plain browser tab): the constructor still works there.
    try {
      new Notification(notification.title, options);
    } catch {
      /* Some browsers only allow the worker path; nothing else to try. */
    }
  }

  async cancel(id: number): Promise<void> {
    this.cancelTimer(id);
    this.pending.delete(id);
    const registration = await navigator.serviceWorker?.getRegistration();
    const shown = await registration?.getNotifications({ tag: String(id) });
    shown?.forEach((entry) => entry.close());
  }

  async cancelAll(): Promise<void> {
    for (const [id] of this.pending) this.cancelTimer(id);
    this.pending.clear();
    const registration = await navigator.serviceWorker?.getRegistration();
    const shown = await registration?.getNotifications();
    shown?.forEach((entry) => entry.close());
  }

  async listPending(): Promise<ScheduledNotification[]> {
    return Array.from(this.pending.values()).map((entry) => entry.notification);
  }

  onTapped(handler: (route: string | null) => void): () => void {
    this.tapHandlers.add(handler);
    this.listen();
    return () => { this.tapHandlers.delete(handler); };
  }

  /** The worker posts a message when a notification is tapped. */
  private listen(): void {
    if (this.listening || !('serviceWorker' in navigator)) return;
    this.listening = true;
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string; route?: string | null } | null;
      if (data?.type !== 'notification-tap') return;
      for (const handler of this.tapHandlers) handler(data.route ?? null);
    });
  }

  private cancelTimer(id: number): void {
    const entry = this.pending.get(id);
    if (entry?.timer != null) window.clearTimeout(entry.timer);
  }
}
