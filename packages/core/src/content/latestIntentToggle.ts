// A like / save / follow switch that stays correct under rapid taps.
//
// Firing one request per tap races: like → unlike → like sends three
// requests that can land in any order, and each response used to overwrite
// the count with whatever that request saw, so the heart and the number
// could end up disagreeing with each other and with the server. Here, per
// key, at most ONE request is in flight. Taps only move the *desired* value;
// when the request in flight answers and the desired value has moved on,
// exactly one more request is sent for the latest intent. A tap that ends
// where the server already is sends nothing.
//
// The caller paints the optimistic state itself on every tap; this reports
// back once per burst: `onSettled` with the server's final answer, or
// `onFailed` with the last value the server confirmed, to roll back to.

type Entry = { confirmed: boolean; desired: boolean; inFlight: boolean };

export type LatestIntentToggle = {
  /**
   * Records the latest intent for `key`. `confirmed` is the server state as
   * currently known, used only when no burst is under way for this key.
   */
  set(key: string, desired: boolean, confirmed: boolean): void;
  /** A request for this key is in flight or queued. */
  isPending(key: string): boolean;
};

export function createLatestIntentToggle<R>(options: {
  /** Sends one change; throws (or rejects) when it did not apply. */
  send: (key: string, value: boolean) => Promise<R>;
  onSettled: (key: string, value: boolean, result: R) => void;
  onFailed: (key: string, confirmed: boolean) => void;
}): LatestIntentToggle {
  const entries = new Map<string, Entry>();

  async function run(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    if (entry.desired === entry.confirmed) {
      entries.delete(key);
      return;
    }
    entry.inFlight = true;
    const value = entry.desired;
    let result: R;
    try {
      result = await options.send(key, value);
    } catch {
      entries.delete(key);
      options.onFailed(key, entry.confirmed);
      return;
    }
    entry.confirmed = value;
    entry.inFlight = false;
    if (entry.desired !== value) {
      void run(key);
      return;
    }
    entries.delete(key);
    options.onSettled(key, value, result);
  }

  return {
    set(key, desired, confirmed) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { confirmed, desired, inFlight: false };
        entries.set(key, entry);
      }
      entry.desired = desired;
      if (!entry.inFlight) void run(key);
    },
    isPending(key) {
      return entries.has(key);
    },
  };
}
