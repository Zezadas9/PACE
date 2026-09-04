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
import type { CoachContext, CoachTurn } from '../domain/coach/types';
import type { CoachIntent } from '../domain/coach/intent';

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

/* --- Assistant ------------------------------------------------------------- */

/**
 * De onde vem a resposta do assistente.
 *
 * Há duas implementações, e o contrato é o mesmo para as duas:
 *
 * - o **motor local**, determinístico, que corre no dispositivo e não fala com
 *   ninguém;
 * - o **remoto**, que fala com o Worker da PACE — e só com ele, porque a chave
 *   da Anthropic nunca sai do backend. Uma chave dentro de uma app instalada é
 *   uma chave pública.
 *
 * O remoto tem sempre o local por baixo: se a rede falhar, se o backend não
 * estiver configurado ou se a resposta não couber no formato, responde o motor
 * local e o ecrã diz que foi assim.
 */
export interface AssistantPort extends Capability {
  /** False no motor local: nada sai do dispositivo. */
  isRemote(): boolean;
  /** O nome do motor, para os ecrãs poderem ser honestos sobre o que é. */
  readonly engine: string;
  respond(request: AssistantRequest): Promise<AssistantReply>;
}

export interface AssistantRequest {
  message: string;
  /** O contexto já filtrado pelas autorizações do utilizador. */
  context: CoachContext;
  /**
   * O que foi entendido na resposta anterior.
   *
   * Sem isto, "mas só de superiores" é uma frase sem sentido. Com isto, é uma
   * correção ao pedido de treino que veio antes.
   */
  previousIntent?: CoachIntent | null;
  /**
   * As últimas mensagens da conversa, já reduzidas.
   *
   * Vai só o que a conversa precisa para fazer sentido — nunca o snapshot da
   * aplicação nem nada fora do contexto autorizado.
   */
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  /**
   * Uma fotografia ou um documento que acompanha a mensagem.
   *
   * Uma de cada vez, de propósito: duas imagens numa pergunta é quase sempre
   * duas perguntas. Os dados vão em base64 já reduzidos pelo cliente — o
   * original de 4 MB da câmara não atravessa a rede.
   *
   * O motor local não os lê. Uma pergunta com imagem que caia no fallback é
   * respondida a dizer isso, e não a fingir que viu.
   */
  attachment?: AssistantAttachment | null;
}

export interface AssistantAttachment {
  kind: 'image' | 'document';
  /** "image/jpeg", "image/png", "image/webp" ou "application/pdf". */
  mediaType: string;
  /** O conteúdo em base64, sem o prefixo "data:". */
  data: string;
  /** O nome do ficheiro, quando veio de um. Só para o ecrã o poder mostrar. */
  name?: string | null;
}

export interface AssistantReply {
  turn: CoachTurn;
  /** Milissegundos gastos, para os ecrãs poderem esperar de forma honesta. */
  elapsedMs: number;
  /** Quem respondeu, para o ecrã poder ser honesto sobre isso. */
  engine?: string;
  /** Verdadeiro quando a resposta veio do backend. */
  remote?: boolean;
  /** Verdadeiro quando o remoto falhou e respondeu o motor local. */
  fallback?: boolean;
}

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
  assistant: AssistantPort;
}
