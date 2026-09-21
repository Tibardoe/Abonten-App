// What a data-driven screen should show, decided in one place.
//
// React Query exposes several independent flags (status, fetchStatus, data,
// isRestoring) plus the app's own online state. Screens that branched on one
// or two of them conflated states that mean very different things to a
// person: "No conversations yet" was shown for an inbox that simply hadn't
// been loaded because the phone was offline, and a detail screen showed a
// bare "Retry" for an offline cache miss. Every screen now asks this one
// function, so the rules below hold everywhere:
//
//   * data you already have is shown — refreshing, stale, or after a failed
//     refresh; an error never replaces content;
//   * "empty" is only ever an answer the server actually gave;
//   * with nothing to show, "loading" means a request is really on its way
//     (or the saved cache is still being read back), "offline" means none
//     can be made, and "error" means one was made and failed.

export type QueryViewKind =
  | "content"
  | "empty"
  | "loading"
  | "offline"
  | "error";

export type QueryViewInput = {
  /** A usable value is in the cache (restored, fetched or seeded). */
  hasData: boolean;
  /** That value holds nothing to list. Ignored without data. */
  isEmpty: boolean;
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  /** The saved cache is still being read back from disk. */
  restoring: boolean;
  online: boolean;
  /** Attempts that have failed since the last success (informational). */
  failureCount?: number;
};

export type QueryView = {
  kind: QueryViewKind;
  /** Content on screen and a request in flight to refresh it. */
  refreshing: boolean;
  /** Content on screen, but the latest attempt to refresh it failed. */
  refreshFailed: boolean;
};

export function resolveQueryView(input: QueryViewInput): QueryView {
  const { hasData, isEmpty, status, fetchStatus, restoring, online } = input;

  if (hasData) {
    return {
      kind: isEmpty ? "empty" : "content",
      refreshing: fetchStatus === "fetching",
      refreshFailed: status === "error",
    };
  }

  const none = { refreshing: false, refreshFailed: false };
  if (restoring) return { kind: "loading", ...none };
  // Confirmed offline (the app's connectivity signal is already debounced)
  // with nothing cached: say so now. The attempt React Query still makes can
  // sit for many seconds — an expired token first retries its refresh
  // against an auth server it cannot reach — and a skeleton for that long
  // claims something is coming. If the attempt does succeed, the data
  // replaces this.
  if (!online) return { kind: "offline", ...none };
  if (fetchStatus === "fetching") {
    return { kind: "loading", ...none };
  }
  // A paused query is one React Query is holding until the network returns.
  if (fetchStatus === "paused") return { kind: "offline", ...none };
  if (status === "error") return { kind: "error", ...none };
  // Pending and idle: about to start, or waiting on a dependency.
  return { kind: "loading", ...none };
}
