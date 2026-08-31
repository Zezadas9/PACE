/**
 * Web storage adapters.
 *
 * `WebStoragePort` is localStorage — right for the browser, wrong for device.
 * The native build swaps in a Preferences/SQLite port; nothing above changes
 * because both satisfy `StoragePort`.
 */

import { APP } from '../../core/constants';
import type { StoragePort } from '../types';

function localStorageWritable(): boolean {
  try {
    const probe = `${APP.storageNamespace}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export class WebStoragePort implements StoragePort {
  readonly name = 'localStorage';

  async isAvailable(): Promise<boolean> {
    return localStorageWritable();
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt payload: keep it aside rather than destroying user data.
      try {
        window.localStorage.setItem(`${key}.corrupt`, raw);
      } catch {
        /* nothing else we can do */
      }
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  }

  async keys(): Promise<string[]> {
    return Object.keys(window.localStorage).filter((key) =>
      key.startsWith(APP.storageNamespace),
    );
  }
}

/** Session-only fallback, so the app still runs where storage is blocked. */
export class MemoryStoragePort implements StoragePort {
  readonly name = 'memory';
  private map = new Map<string, string>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.map.get(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.map.keys());
  }
}

export function createWebStoragePort(): StoragePort {
  return localStorageWritable() ? new WebStoragePort() : new MemoryStoragePort();
}
