import { useIsOnline } from "@/lib/network";
import { isErrorEnvelopeData } from "@abonten/core/query/persistPolicy";
import {
  type QueryView,
  resolveQueryView,
} from "@abonten/core/query/queryView";
import { useIsRestoring } from "@tanstack/react-query";

type QueryLike<T> = {
  data: T | undefined;
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  failureCount?: number;
};

/**
 * What a screen backed by `query` should show — content, a genuine empty
 * state, loading, offline or error — resolved by @abonten/core/query/
 * queryView so every screen draws the same line between "there is nothing"
 * and "this phone doesn't have it right now".
 *
 * `isEmpty` decides when a successful answer holds nothing to list. A value
 * that is an `{ status >= 400 }` envelope (the typed API client returns
 * failures as data) counts as a failed request, not as data.
 */
export function useQueryView<T>(
  query: QueryLike<T>,
  isEmpty?: (data: T) => boolean,
): QueryView {
  const online = useIsOnline();
  const restoring = useIsRestoring();
  const envelopeFailure =
    query.data !== undefined && isErrorEnvelopeData(query.data);
  const hasData = query.data !== undefined && !envelopeFailure;
  return resolveQueryView({
    hasData,
    isEmpty: hasData && !!isEmpty && isEmpty(query.data as T),
    status: envelopeFailure ? "error" : query.status,
    fetchStatus: query.fetchStatus,
    restoring,
    online,
    failureCount: query.failureCount,
  });
}
