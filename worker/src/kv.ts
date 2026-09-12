/**
 * O bocado do KV da Cloudflare que este Worker usa.
 *
 * Estreito de proposito: o que esta aqui e o que os testes tem de imitar, e
 * uma interface pequena e uma interface facil de imitar sem enganos. O binding
 * verdadeiro encaixa nela sem conversao nenhuma.
 */
export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

/** Le um registo guardado como JSON. Um registo estragado conta como ausente. */
export async function readJson<T>(store: KvStore, key: string): Promise<T | null> {
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(store: KvStore, key: string, value: unknown): Promise<void> {
  await store.put(key, JSON.stringify(value));
}
