/**
 * PACE — Platform ports.
 *
 * One interface per native capability. Features depend on these interfaces and
 * never on a plugin: `usePlatform().notifications`, never
 * `import { LocalNotifications } from '@capacitor/local-notifications'`.
 *
 * Adding a native capability then means writing one implementation under
 * `platform/capacitor/` and registering it — no screen changes. That is what
 * makes the move to iOS and Android a packaging step rather than a rewrite.
 *
 * Every method is async even when the web implementation is synchronous,
 * because the native bridge is always asynchronous.
 */

import type { ActivitySession, DayKey } from '../core/types';

export type PlatformName = 'web' | 'ios' | 'android';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** Every port answers this, so a feature can degrade instead of throwing. */
export interface Capability {
  /** False on platforms where the capability cannot exist at all. */
  isAvailable(): Promise<boolean>;
}

/* --- Storage -------------------------------------------------------------- */

/**
 * Durable key/value storage.
 *
 * On the web this is localStorage. On device it must NOT be: iOS evicts
 * WebView localStorage under storage pressure and excludes it from backups, so
 * the native implementation uses Preferences (UserDefaults / SharedPreferences)
 * and, once collections grow, SQLite.
 */
export interface StoragePort extends Capability {
  readonly name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/* --- Device & app lifecycle ----------------------------------------------- */

export interface DeviceInfo {
  platform: PlatformName;
  isNative: boolean;
  /** Standalone PWA or native shell — anything without browser chrome. */
  isStandalone: boolean;
  model: string | null;
  osVersion: string | null;
  appVersion: string;
}

export interface DevicePort extends Capability {
  getInfo(): Promise<DeviceInfo>;
  /** Android hardware back button. Returns an unsubscribe function. */
  onBackButton(handler: () => void): () => void;
  /** Foreground/background transitions — flush pending writes on 'background'. */
  onAppStateChange(handler: (state: 'active' | 'background') => void): () => void;
  /** Tint the native status bar to match the current theme. */
  setStatusBarStyle(style: 'light' | 'dark'): Promise<void>;
  /** No-op on web; hides the native splash once the first screen is painted. */
  hideSplashScreen(): Promise<void>;
  /** Short tactile confirmation. Silently ignored where unsupported. */
  haptic(style: 'light' | 'medium' | 'heavy' | 'success'): Promise<void>;
}

/* --- Local notifications -------------------------------------------------- */

export interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  /** When to fire. Past instants fire immediately. */
  at: Date;
  /** Repeat cadence, for habit reminders. */
  repeats?: 'daily' | 'weekly' | null;
  /** Deep link handled by the router when the user taps it. */
  route?: string | null;
}

export interface NotificationsPort extends Capability {
  checkPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  schedule(notification: ScheduledNotification): Promise<void>;
  cancel(id: number): Promise<void>;
  cancelAll(): Promise<void>;
  listPending(): Promise<ScheduledNotification[]>;
  /** Fires when the user taps a notification. Returns an unsubscribe function. */
  onTapped(handler: (route: string | null) => void): () => void;
}

/* --- Geolocation ---------------------------------------------------------- */

export interface Position {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  altitudeM: number | null;
  speedMs: number | null;
  timestamp: number;
}

export interface GeolocationPort extends Capability {
  checkPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  getCurrent(): Promise<Position | null>;
  /** Continuous updates for route tracking. Returns an unsubscribe function. */
  watch(handler: (position: Position) => void): () => void;
}

/* --- Background execution -------------------------------------------------- */

export interface BackgroundPort extends Capability {
  /**
   * Keep a task alive briefly after the app is backgrounded — long enough to
   * finish a write or close a tracked activity. Both platforms cap this.
   */
  runWhileBackgrounded(task: () => Promise<void>): Promise<void>;
  /** Ask the OS to keep delivering location while tracking an activity. */
  setTrackingMode(enabled: boolean): Promise<void>;
}

/* --- Health (HealthKit / Health Connect) ----------------------------------- */

export type HealthMetric =
  | 'steps'
  | 'activeEnergy'
  | 'distanceWalkingRunning'
  | 'heartRate'
  | 'restingHeartRate'
  | 'sleep'
  | 'bodyMass'
  | 'height'
  | 'workouts';

export interface HealthSample {
  metric: HealthMetric;
  value: number;
  unit: string;
  start: string;
  end: string;
  /** Stable id from the health store, so a re-import does not duplicate. */
  externalId: string | null;
  source: string | null;
}

/**
 * HealthKit on iOS, Health Connect on Android. Deliberately one port: the two
 * differ in permission model and units, and normalising here keeps that
 * difference out of every feature.
 */
export interface HealthPort extends Capability {
  checkPermissions(metrics: HealthMetric[]): Promise<Record<HealthMetric, PermissionState>>;
  requestPermissions(metrics: HealthMetric[]): Promise<Record<HealthMetric, PermissionState>>;
  /** Read samples in a date range. Values arrive in canonical metric units. */
  read(metric: HealthMetric, from: DayKey, to: DayKey): Promise<HealthSample[]>;
  /** Import workouts as ActivitySession records, already deduplicated. */
  readWorkouts(from: DayKey, to: DayKey): Promise<ActivitySession[]>;
  /** Write back, so PACE can be a source as well as a consumer. */
  write(sample: Omit<HealthSample, 'externalId' | 'source'>): Promise<void>;
}

/* --- Sensors & wearables --------------------------------------------------- */

export interface SensorPort extends Capability {
  /** Live step count from the pedometer, for a foreground activity screen. */
  watchSteps(handler: (steps: number) => void): () => void;
  /** Heart rate from a paired wearable, where the OS exposes a live stream. */
  watchHeartRate(handler: (bpm: number) => void): () => void;
}

/* --- Network -------------------------------------------------------------- */

export interface NetworkStatus {
  connected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
}

export interface NetworkPort extends Capability {
  getStatus(): Promise<NetworkStatus>;
  onStatusChange(handler: (status: NetworkStatus) => void): () => void;
}

/* --- Auth ----------------------------------------------------------------- */

export interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

/**
 * Not implemented in this phase. The port exists so that when sign-in arrives,
 * the token store, the sync service and the sign-out flow already have a shape
 * to talk to — and so native SSO (Sign in with Apple, Credential Manager) can
 * replace a web redirect without touching callers.
 */
export interface AuthPort extends Capability {
  getSession(): Promise<AuthSession | null>;
  signIn(provider: 'password' | 'apple' | 'google', payload?: unknown): Promise<AuthSession>;
  signOut(): Promise<void>;
  onSessionChange(handler: (session: AuthSession | null) => void): () => void;
}

/* --- The aggregate --------------------------------------------------------- */

export interface Platform {
  info: DeviceInfo;
  storage: StoragePort;
  device: DevicePort;
  notifications: NotificationsPort;
  geolocation: GeolocationPort;
  background: BackgroundPort;
  health: HealthPort;
  sensors: SensorPort;
  network: NetworkPort;
  auth: AuthPort;
}
