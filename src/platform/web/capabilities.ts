/**
 * Web implementations of the remaining ports.
 *
 * Most report `isAvailable() === false`. That is the point: a feature asks
 * before it acts and degrades instead of throwing, so the same screen code runs
 * on the web today and on device later.
 */

import type {
  AuthPort, AuthSession, BackgroundPort, GeolocationPort, HealthMetric,
  HealthPort, HealthSample, NetworkPort, NetworkStatus, NotificationsPort,
  PermissionState, Position, ScheduledNotification, SensorPort,
} from '../types';
import type { ActivitySession } from '../../core/types';

/** navigator.geolocation genuinely works in a browser, so this one is real. */
export class WebGeolocationPort implements GeolocationPort {
  async isAvailable(): Promise<boolean> {
    return 'geolocation' in navigator;
  }

  async checkPermission(): Promise<PermissionState> {
    if (!('permissions' in navigator)) return 'prompt';
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state as PermissionState;
    } catch {
      return 'prompt';
    }
  }

  async requestPermission(): Promise<PermissionState> {
    // The browser has no explicit request: asking for a position is the prompt.
    const position = await this.getCurrent();
    return position ? 'granted' : 'denied';
  }

  async getCurrent(): Promise<Position | null> {
    if (!('geolocation' in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(toPosition(position)),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
  }

  watch(handler: (position: Position) => void): () => void {
    if (!('geolocation' in navigator)) return () => {};
    const id = navigator.geolocation.watchPosition(
      (position) => handler(toPosition(position)),
      () => {},
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }
}

function toPosition(position: GeolocationPosition): Position {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? null,
    altitudeM: position.coords.altitude ?? null,
    speedMs: position.coords.speed ?? null,
    timestamp: position.timestamp,
  };
}

export class WebNetworkPort implements NetworkPort {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getStatus(): Promise<NetworkStatus> {
    return { connected: navigator.onLine, connectionType: 'unknown' };
  }

  onStatusChange(handler: (status: NetworkStatus) => void): () => void {
    const emit = (): void => {
      handler({ connected: navigator.onLine, connectionType: 'unknown' });
    };
    window.addEventListener('online', emit);
    window.addEventListener('offline', emit);
    return () => {
      window.removeEventListener('online', emit);
      window.removeEventListener('offline', emit);
    };
  }
}

/**
 * A browser cannot schedule a notification for later without a service worker
 * and a push subscription, so this reports unavailable rather than pretending.
 */
export class WebNotificationsPort implements NotificationsPort {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async checkPermission(): Promise<PermissionState> {
    if (!('Notification' in window)) return 'unavailable';
    const permission = Notification.permission;
    return permission === 'default' ? 'prompt' : (permission as PermissionState);
  }

  async requestPermission(): Promise<PermissionState> {
    if (!('Notification' in window)) return 'unavailable';
    const result = await Notification.requestPermission();
    return result === 'default' ? 'prompt' : (result as PermissionState);
  }

  async schedule(_notification: ScheduledNotification): Promise<void> {
    /* not schedulable on the web */
  }

  async cancel(_id: number): Promise<void> {}
  async cancelAll(): Promise<void> {}
  async listPending(): Promise<ScheduledNotification[]> {
    return [];
  }
  onTapped(): () => void {
    return () => {};
  }
}

export class UnavailableBackgroundPort implements BackgroundPort {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async runWhileBackgrounded(task: () => Promise<void>): Promise<void> {
    // Best effort: run it now and hope the tab survives long enough.
    await task();
  }
  async setTrackingMode(_enabled: boolean): Promise<void> {}
}

export class UnavailableHealthPort implements HealthPort {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async checkPermissions(metrics: HealthMetric[]): Promise<Record<HealthMetric, PermissionState>> {
    return denyAll(metrics);
  }
  async requestPermissions(metrics: HealthMetric[]): Promise<Record<HealthMetric, PermissionState>> {
    return denyAll(metrics);
  }
  async read(): Promise<HealthSample[]> {
    return [];
  }
  async readWorkouts(): Promise<ActivitySession[]> {
    return [];
  }
  async write(): Promise<void> {}
}

function denyAll(metrics: HealthMetric[]): Record<HealthMetric, PermissionState> {
  return Object.fromEntries(
    metrics.map((metric) => [metric, 'unavailable' as PermissionState]),
  ) as Record<HealthMetric, PermissionState>;
}

export class UnavailableSensorPort implements SensorPort {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  watchSteps(): () => void {
    return () => {};
  }
  watchHeartRate(): () => void {
    return () => {};
  }
}

/** Auth arrives in a later phase; the shape is fixed so callers can be written. */
export class UnimplementedAuthPort implements AuthPort {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async getSession(): Promise<AuthSession | null> {
    return null;
  }
  async signIn(): Promise<AuthSession> {
    throw new Error('Autenticação ainda não está disponível nesta fase.');
  }
  async signOut(): Promise<void> {}
  onSessionChange(): () => void {
    return () => {};
  }
}
