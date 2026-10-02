// One value, and the people who want to know when it changes.
//
// For state that must reach the screen at once, wherever it was set from.
// React holds back every state update made inside a transition until the
// transition's work is done, so a confirmation dialog opened with useState
// from inside `startTransition(async () => { if (!(await confirm())) … })`
// never appeared: its "open" was waiting for the very action that was
// waiting for its answer. A store read with useSyncExternalStore is not a
// transition update; it renders immediately.

export type ValueStore<T> = {
  get(): T;
  set(next: T): void;
  /** Returns the way to stop listening. */
  subscribe(listener: () => void): () => void;
};

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
