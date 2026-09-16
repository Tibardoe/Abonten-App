// A random per-browser key for view counting and sponsored frequency caps.
// It identifies nothing about the person and is hashed again on the server
// before it is stored. Private windows or blocked storage get a per-tab key.

const STORAGE_KEY = "abn_content_viewer";
let memoryKey: string | null = null;

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getViewerKey(): string {
  if (memoryKey) return memoryKey;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length >= 8) {
      memoryKey = stored;
      return stored;
    }
    const fresh = randomKey();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    memoryKey = fresh;
    return fresh;
  } catch {
    memoryKey = randomKey();
    return memoryKey;
  }
}
