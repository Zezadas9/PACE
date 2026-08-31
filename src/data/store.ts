/**
 * PACE — Store.
 *
 * Loads one snapshot at boot, hands the app a synchronous in-memory copy, and
 * writes back debounced through a `StoragePort`. Screens stay synchronous;
 * durability lives here.
 *
 * The store also emits a version number on every mutation, which is what
 * `useSyncExternalStore` subscribes to — no extra state library needed.
 */

import { APP } from '../core/constants';
import type { StoragePort } from '../platform/types';
import {
  emptySnapshot, migrate, normalize, STORAGE_KEY, type Snapshot,
} from './snapshot';

const WRITE_DEBOUNCE_MS = 120;

type Listener = () => void;

export class Store {
  snapshot: Snapshot = emptySnapshot();
  loaded = false;
  /** True when writes are not durable — reported to the user, not swallowed. */
  degraded = false;

  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;

  constructor(private readonly storage: StoragePort) {}

  async load(): Promise<Snapshot> {
    this.degraded = !(await this.storage.isAvailable());
    try {
      const raw = await this.storage.get<Partial<Snapshot>>(STORAGE_KEY);
      this.snapshot = normalize(migrate(normalize(raw)));
    } catch {
      this.snapshot = emptySnapshot();
    }
    this.loaded = true;
    return this.snapshot;
  }

  /** Mark dirty. Coalesces a burst of edits into one write. */
  persist(): void {
    this.bumpVersion();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, WRITE_DEBOUNCE_MS);
  }

  /** Write now. Called on app background, where a debounce would lose data. */
  async flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.snapshot.savedAt = new Date().toISOString();
    this.snapshot.schemaVersion = APP.schemaVersion;
    this.snapshot.appVersion = APP.version;
    try {
      await this.storage.set(STORAGE_KEY, this.snapshot);
      return true;
    } catch (error) {
      this.degraded = true;
      console.warn('[PACE] persist failed:', error);
      return false;
    }
  }

  async reset(): Promise<boolean> {
    this.snapshot = emptySnapshot();
    const ok = await this.flush();
    this.bumpVersion();
    return ok;
  }

  /** Portable backup, and the exact payload a future sync would push. */
  exportJson(): string {
    return JSON.stringify(this.snapshot, null, 2);
  }

  async importJson(json: string): Promise<boolean> {
    this.snapshot = normalize(migrate(normalize(JSON.parse(json))));
    const ok = await this.flush();
    this.bumpVersion();
    return ok;
  }

  /* --- Reactivity ---------------------------------------------------------
     useSyncExternalStore needs a subscribe function and a cheap, stable
     snapshot value. A monotonic counter is both.                            */

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  private bumpVersion(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}
