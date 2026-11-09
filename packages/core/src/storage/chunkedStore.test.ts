import { describe, expect, it } from "vitest";
import { type SmallValueBackend, createChunkedStore } from "./chunkedStore";

const KEY = "sb-project-auth-token";
const CHUNK = 10;

class Killed extends Error {}

/**
 * An in-memory backend that "kills the app" after a number of writes and
 * deletes: that operation and every later one fail, as if the process had
 * gone. The items written so far stay, as they would in the keychain.
 */
function memoryBackend(items = new Map<string, string>(), killAfter = -1) {
  let left = killAfter;
  let dead = false;
  const step = () => {
    if (dead) throw new Killed();
    if (left === 0) {
      dead = true;
      throw new Killed();
    }
    if (left > 0) left--;
  };
  const backend: SmallValueBackend = {
    async getItemAsync(key) {
      if (dead) throw new Killed();
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      step();
      items.set(key, value);
    },
    async deleteItemAsync(key) {
      step();
      items.delete(key);
    },
  };
  return { backend, items, isDead: () => dead };
}

const store = (backend: SmallValueBackend) =>
  createChunkedStore(backend, { chunkSize: CHUNK });

/** The reader every app build before this one shipped. */
async function oldReader(items: Map<string, string>, key: string) {
  const n = Number.parseInt(items.get(key) ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const part = items.get(`${key}.${i}`);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join("");
}

// Three values of different lengths, so pieces are added and dropped.
const OLD = `{"refresh_token":"old","pad":"${"o".repeat(47)}"}`;
const NEW = `{"refresh_token":"new","pad":"${"n".repeat(14)}"}`;
const NEWER = `{"refresh_token":"newer","pad":"${"x".repeat(60)}"}`;
const pieceKeys = (value: string) =>
  Array.from(
    { length: Math.ceil(value.length / CHUNK) },
    (_, i) => `${KEY}.${i}`,
  );

describe("createChunkedStore", () => {
  it("reads back what it wrote, longer and shorter, and removes it", async () => {
    const { backend, items } = memoryBackend();
    const s = store(backend);
    await s.setItem(KEY, OLD);
    expect(await s.getItem(KEY)).toBe(OLD);
    await s.setItem(KEY, NEW);
    expect(await s.getItem(KEY)).toBe(NEW);
    // Nothing of the journal or of the longer value is left behind.
    expect(OLD.length).toBeGreaterThan(NEW.length + CHUNK);
    expect([...items.keys()].sort()).toEqual([KEY, ...pieceKeys(NEW)].sort());
    await s.removeItem(KEY);
    expect(await s.getItem(KEY)).toBeNull();
    expect(items.size).toBe(0);
  });

  it("reads a session saved by earlier builds of the app", async () => {
    const items = new Map<string, string>([
      [KEY, "3"],
      [`${KEY}.0`, "abcdefghij"],
      [`${KEY}.1`, "klmnopqrst"],
      [`${KEY}.2`, "uvwxyz"],
    ]);
    const s = store(memoryBackend(items).backend);
    expect(await s.getItem(KEY)).toBe("abcdefghijklmnopqrstuvwxyz");
  });

  it("leaves a value earlier builds can still read (an update rolled back)", async () => {
    const { backend, items } = memoryBackend();
    const s = store(backend);
    await s.setItem(KEY, OLD);
    await s.setItem(KEY, NEW);
    expect(await oldReader(items, KEY)).toBe(NEW);
  });

  it("never leaves half a value, wherever the app is killed during a write", async () => {
    // Count the operations of one whole overwrite first.
    const probe = memoryBackend();
    await store(probe.backend).setItem(KEY, OLD);
    let ops = 0;
    const counting: SmallValueBackend = {
      getItemAsync: (k) => probe.backend.getItemAsync(k),
      setItemAsync: (k, v) => {
        ops++;
        return probe.backend.setItemAsync(k, v);
      },
      deleteItemAsync: (k) => {
        ops++;
        return probe.backend.deleteItemAsync(k);
      },
    };
    await store(counting).setItem(KEY, NEW);
    expect(ops).toBeGreaterThan(10);

    for (let killAt = 0; killAt <= ops; killAt++) {
      const items = new Map<string, string>();
      await store(memoryBackend(items).backend).setItem(KEY, OLD);

      const dying = memoryBackend(items, killAt);
      await store(dying.backend)
        .setItem(KEY, NEW)
        .catch((e) => {
          if (!(e instanceof Killed)) throw e;
        });

      // The app starts again on whatever the keychain holds.
      const restarted = store(memoryBackend(items).backend);
      const seen = await restarted.getItem(KEY);
      expect([OLD, NEW]).toContain(seen);

      // And the next write (a token refresh) works from that state.
      await restarted.setItem(KEY, NEWER);
      expect(await restarted.getItem(KEY)).toBe(NEWER);
      expect(await oldReader(items, KEY)).toBe(NEWER);
      expect([...items.keys()].some((k) => k.startsWith(`${KEY}.j`))).toBe(
        false,
      );
    }
  });

  it("survives a second kill while finishing an interrupted write", async () => {
    for (let first = 0; first < 40; first++) {
      for (let second = 0; second < 60; second++) {
        const items = new Map<string, string>();
        await store(memoryBackend(items).backend).setItem(KEY, OLD);
        await store(memoryBackend(items, first).backend)
          .setItem(KEY, NEW)
          .catch(() => {});
        const before = await store(memoryBackend(items).backend).getItem(KEY);
        await store(memoryBackend(items, second).backend)
          .setItem(KEY, NEWER)
          .catch(() => {});
        const after = await store(memoryBackend(items).backend).getItem(KEY);
        expect([before, NEWER]).toContain(after);
        expect([OLD, NEW]).toContain(before);
      }
    }
  });

  it("is whole or absent wherever a removal is cut short", async () => {
    for (let killAt = 0; killAt < 40; killAt++) {
      const items = new Map<string, string>();
      await store(memoryBackend(items).backend).setItem(KEY, OLD);
      await store(memoryBackend(items, killAt).backend)
        .removeItem(KEY)
        .catch(() => {});
      const seen = await store(memoryBackend(items).backend).getItem(KEY);
      // The first two steps delete the heads; after them it is gone.
      if (killAt >= 2) expect(seen).toBeNull();
      else expect(seen).toBe(OLD);
    }
  });

  it("runs writes of one key one at a time", async () => {
    const { backend } = memoryBackend();
    const s = store(backend);
    await Promise.all([
      s.setItem(KEY, OLD),
      s.setItem(KEY, NEW),
      s.setItem(KEY, NEWER),
    ]);
    expect(await s.getItem(KEY)).toBe(NEWER);
  });

  it("refuses a value over the size limit without touching what is stored", async () => {
    const { backend } = memoryBackend();
    const s = createChunkedStore(backend, { chunkSize: CHUNK, maxChunks: 3 });
    await s.setItem(KEY, "short");
    await expect(s.setItem(KEY, "x".repeat(31))).rejects.toThrow(/size limit/);
    expect(await s.getItem(KEY)).toBe("short");
  });
});
