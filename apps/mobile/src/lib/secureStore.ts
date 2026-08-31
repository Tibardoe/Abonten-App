import * as SecureStore from "expo-secure-store";

// A Supabase auth `storage` adapter backed by expo-secure-store.
//
// SecureStore warns (and on some platforms fails) for values larger than
// ~2KB, and a Supabase session JSON is usually bigger than that. So each
// logical key is split into <2KB chunks: `<key>` holds the chunk count,
// `<key>.0`, `<key>.1`, … hold the pieces. Reads reassemble; writes replace;
// removes clear every chunk plus any stragglers from a previously longer
// value.

const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 50; // ~90KB ceiling — far more than a session ever needs

async function getChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw == null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await getChunkCount(key);
    if (count === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null; // torn write — treat as absent
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await getChunkCount(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    if (chunks.length > MAX_CHUNKS) {
      throw new Error(`secureStorage: value for "${key}" exceeds size limit`);
    }

    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
    }
    // Drop chunks left over from a previously longer value.
    for (let i = chunks.length; i < previous; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = await getChunkCount(key);
    for (let i = 0; i < Math.max(count, MAX_CHUNKS); i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};
