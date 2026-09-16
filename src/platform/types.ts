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
   * As fotografias, os fotogramas de video e os documentos da mensagem.
   *
   * Varios de uma vez: um horario tem duas paginas, um plano vem em tres
   * fotografias. Os dados vao em base64 ja reduzidos pelo cliente — o original
   * de 4 MB da camara nao atravessa a rede.
   *
   * O motor local nao os le. Uma pergunta com anexos que caia no fallback e
   * respondida a dizer isso, e nao a fingir que viu.
   */
  attachments?: AssistantAttachment[];
}

export interface AssistantAttachment {
  kind: 'image' | 'document' | 'text';
  /** "image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain" ou "text/csv". */
  mediaType: string;
  /** O conteúdo em base64, sem o prefixo "data:". */
  data: string;
  /** O nome do ficheiro — so nos documentos. Fotos e videos seguem sem nome. */
  name?: string | null;
  /** De onde veio: uma foto, um fotograma de um video, ou um ficheiro. */
  origin?: 'photo' | 'video' | 'file' | null;
  /** Num video, qual e o fotograma e quantos ha. */
  frame?: { index: number; of: number } | null;
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
  /**
   * Porque é que o remoto não respondeu.
   *
   * Sem isto, o ecrã dizia sempre a mesma frase — "não cheguei ao assistente
   * online" — para cinco causas diferentes, e quem a lia não ficava a saber se
   * havia alguma coisa a fazer. Há: sem rede espera-se, com o backend a
   * recusar não vale a pena insistir.
   */
  fallbackReason?: string;
}

/* --- Base de dados de alimentos ------------------------------------------- */

/** Um alimento como a PACE o guarda: por 100 g, com nulos onde não se sabe. */
export interface FoodResult {
  barcode: string | null;
  name: string;
  brand: string | null;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
}

/**
 * De onde vêm os valores de um alimento que a pessoa não quer escrever.
 *
 * `isAvailable` é falso quando não há backend configurado — e aí a aplicação
 * continua a funcionar com o que sempre teve: escrever à mão.
 */
export interface FoodDatabasePort extends Capability {
  search(query: string): Promise<FoodResult[]>;
  byBarcode(barcode: string): Promise<FoodResult | null>;
}

/* --- Voz ----------------------------------------------------------------- */

/**
 * A voz que guia as sessoes.
 *
 * `unlock` tem de ser chamado dentro de um toque: o iPhone nao deixa uma pagina
 * falar antes disso.
 */
export interface VoicePort {
  supported(): boolean;
  unlock(): void;
  speak(text: string, options?: { interrupt?: boolean }): void;
  cancel(): void;
}

/* --- Licenca ------------------------------------------------------------- */

/** O que o servidor diz sobre o direito de usar a aplicacao. */
export interface LicenceInfo {
  state: 'trial' | 'paid' | 'lifetime' | 'blocked' | 'unmanaged';
  /** O cartao assinado. Ausente quando nao ha acesso. */
  card?: string;
  /** Quando acaba a experiencia. */
  endsAt?: string;
  renewsAt?: string | null;
  /** Onde se gere a subscricao, no Lemon Squeezy. */
  portalUrl?: string | null;
  /** Se a loja esta pronta a vender. */
  canBuy?: boolean;
}

export type RedeemResult =
  | { ok: true; info: LicenceInfo }
  | { ok: false; error: 'invalid' | 'email' | 'offline' };

/**
 * A porta da assinatura.
 *
 * Nao sabe precos nem cartoes de credito: pergunta o estado, entrega codigos e
 * pede o endereco do checkout. Quem cobra e o Lemon Squeezy, e quem decide e o
 * Worker.
 */
export interface LicencePort {
  status(device: string): Promise<LicenceInfo | null>;
  redeem(device: string, code: string, email: string): Promise<RedeemResult>;
  checkout(device: string, code: string | null): Promise<string | null>;
}

/* --- Push ---------------------------------------------------------------- */

/** O resultado de ligar o push, com as causas que o ecra precisa de distinguir. */
export type PushState = 'ok' | 'unsupported' | 'denied' | 'not-configured' | 'failed';

/**
 * O que acorda a aplicacao fechada. Hoje so o lembrete da sequencia o usa.
 *
 * Separado das notificacoes locais porque vive noutro sitio: estas agendam no
 * aparelho, o push precisa de um servidor que o envie.
 */
export interface PushPort {
  supported(): boolean;
  enable(input: { id: string; time: string; timezone: string }): Promise<PushState>;
  reportDay(input: { id: string; date: string; closed: boolean }): Promise<boolean>;
  disable(id: string): Promise<void>;
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
  foodDatabase: FoodDatabasePort;
  push: PushPort;
  licence: LicencePort;
  voice: VoicePort;
}
