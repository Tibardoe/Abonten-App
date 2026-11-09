/**
 * A string store on top of a key-value backend that only takes small values
 * (expo-secure-store: about 2 KB per item on some platforms). The app keeps
 * the sign-in session here, and a session is bigger than one item, so each
 * value is split into pieces:
 *
 *   `<key>`      the number of pieces of the current value
 *   `<key>.<i>`  piece i
 *
 * Writing a value means several separate writes, and the app can be killed
 * between any two of them (swiped away, restarted for an update, killed by
 * the system). Overwriting the pieces in place left a mix of old and new
 * pieces after such a kill; supabase-js reads that back as a damaged session
 * and throws it away, which signed people out. So a write goes through a
 * journal first:
 *
 *   1. the new value is written to `<key>.j.<i>`, then `<key>.j` is set
 *      (from this write on, the journal is the value);
 *   2. the main pieces and `<key>` are rewritten from it;
 *   3. `<key>.j` is deleted (from here the main copy is the value again),
 *      then its pieces.
 *
 * A read prefers a written journal, so a kill at any point leaves either the
 * whole old value or the whole new one. While `<key>.j` exists its pieces are
 * complete and never touched, because a write first finishes any journal an
 * earlier, interrupted write left behind.
 *
 * The main copy keeps the layout the app always used, so an older build of
 * the app (an update rolled back, or the build still embedded in the binary)
 * still reads the session.
 */

export type SmallValueBackend = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type ChunkedStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type ChunkedStoreOptions = {
  /** Characters per piece. */
  chunkSize?: number;
  /** Most pieces one value may take. */
  maxChunks?: number;
};

const JOURNAL = "j";

// Pieces swept on removal beyond the ones a head records: an interrupted
// write can leave a few pieces no head points to. They are never read, only
// tidied away. A session takes 2 to 4 pieces.
const SWEEP_PIECES = 16;

export function createChunkedStore(
  backend: SmallValueBackend,
  { chunkSize = 1800, maxChunks = 50 }: ChunkedStoreOptions = {},
): ChunkedStore {
  const journalKey = (key: string) => `${key}.${JOURNAL}`;

  async function pieceCount(headKey: string): Promise<number> {
    const raw = await backend.getItemAsync(headKey);
    if (raw == null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  async function readPieces(
    prefix: string,
    count: number,
  ): Promise<string | null> {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await backend.getItemAsync(`${prefix}.${i}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  }

  function split(key: string, value: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += chunkSize) {
      chunks.push(value.slice(i, i + chunkSize));
    }
    if (chunks.length > maxChunks) {
      throw new Error(`chunkedStore: value for "${key}" exceeds size limit`);
    }
    return chunks;
  }

  async function writePieces(prefix: string, chunks: string[]): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      await backend.setItemAsync(`${prefix}.${i}`, chunks[i]);
    }
  }

  async function deletePieces(
    prefix: string,
    from: number,
    to: number,
  ): Promise<void> {
    for (let i = from; i < to; i++) {
      await backend.deleteItemAsync(`${prefix}.${i}`);
    }
  }

  // Only ever called while a journal holding the same value is written, so
  // a kill in the middle of it loses nothing.
  async function writeMain(key: string, chunks: string[]): Promise<void> {
    const previous = await pieceCount(key);
    await writePieces(key, chunks);
    await deletePieces(key, chunks.length, previous);
    await backend.setItemAsync(key, String(chunks.length));
  }

  async function dropJournal(key: string, count: number): Promise<void> {
    await backend.deleteItemAsync(journalKey(key));
    await deletePieces(journalKey(key), 0, count);
  }

  async function write(key: string, value: string): Promise<void> {
    const chunks = split(key, value);

    // An earlier write stopped after its journal was written: finish it, so
    // the journal's pieces are free to reuse.
    const pending = await pieceCount(journalKey(key));
    if (pending > 0) {
      const journaled = await readPieces(journalKey(key), pending);
      if (journaled != null) await writeMain(key, split(key, journaled));
      await dropJournal(key, pending);
    }

    await writePieces(journalKey(key), chunks);
    await backend.setItemAsync(journalKey(key), String(chunks.length));
    await writeMain(key, chunks);
    await dropJournal(key, chunks.length);
  }

  async function remove(key: string): Promise<void> {
    const journaled = await pieceCount(journalKey(key));
    const main = await pieceCount(key);
    // Heads first: from the first delete on, the value reads as absent.
    await backend.deleteItemAsync(journalKey(key));
    await backend.deleteItemAsync(key);
    await deletePieces(journalKey(key), 0, Math.max(journaled, SWEEP_PIECES));
    await deletePieces(key, 0, Math.max(main, SWEEP_PIECES));
  }

  // Writes and removals of one key run one at a time: two interleaved
  // writes would share the journal. Reads need no turn; every state a
  // write passes through reads as the old value or the new one.
  const queues = new Map<string, Promise<void>>();
  function inTurn(key: string, job: () => Promise<void>): Promise<void> {
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(job);
    const settled = run.catch(() => {});
    queues.set(key, settled);
    void settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return run;
  }

  return {
    async getItem(key) {
      const journaled = await pieceCount(journalKey(key));
      if (journaled > 0) {
        const value = await readPieces(journalKey(key), journaled);
        if (value != null) return value;
      }
      const count = await pieceCount(key);
      if (count === 0) return null;
      // A missing piece cannot come from a write any more (see above); it
      // would mean the backend lost an item. Absent, not half a value.
      return readPieces(key, count);
    },
    setItem: (key, value) => inTurn(key, () => write(key, value)),
    removeItem: (key) => inTurn(key, () => remove(key)),
  };
}
