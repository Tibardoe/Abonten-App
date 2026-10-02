import { answerOrThrow } from "@abonten/core/envelopeFailure";
import {
  type DefaultError,
  type DefaultedQueryObserverOptions,
  QueryClient,
  type QueryKey,
  type QueryObserverOptions,
} from "@tanstack/react-query";

// Server Actions answer with an envelope and never throw, so a query whose
// action failed used to CACHE the failure: { status: 500 } became the data.
// The components had the right screens all along ("Couldn't load your
// payout accounts. Try again") and never showed them; what showed was the
// empty state ("No payout accounts added yet"), no retry ran, and a
// background refetch that failed replaced a good list with nothing.
//
// Here a failed read is a failed query, for every query at once, present
// and future: each queryFn's answer passes through answerOrThrow
// (@abonten/core/envelopeFailure). A server error, a timeout, rate limiting
// or an unreachable server throws, so React Query keeps the last good data,
// retries with backoff and reports isError. A definite answer ("sign in",
// "not found", "not allowed") is still data: the screen has something true
// to say about it.

type Read = (...args: unknown[]) => unknown;

// Options that were already defaulted come back as the same object, so
// their queryFn is one this file made.
const guarded = new WeakSet<Read>();

export class EnvelopeQueryClient extends QueryClient {
  // Every way a query is fetched (an observer, fetchQuery, prefetchQuery,
  // an infinite query's pages) takes its options from here.
  override defaultQueryOptions<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = never,
  >(
    options:
      | QueryObserverOptions<
          TQueryFnData,
          TError,
          TData,
          TQueryData,
          TQueryKey,
          TPageParam
        >
      | DefaultedQueryObserverOptions<
          TQueryFnData,
          TError,
          TData,
          TQueryData,
          TQueryKey
        >,
  ): DefaultedQueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  > {
    const defaulted = super.defaultQueryOptions(options);
    const holder = defaulted as { queryFn?: unknown };
    const queryFn = holder.queryFn;
    if (typeof queryFn === "function" && !guarded.has(queryFn as Read)) {
      const read = queryFn as Read;
      const answer: Read = async (...args) =>
        answerOrThrow(await read(...args));
      guarded.add(answer);
      holder.queryFn = answer;
    }
    return defaulted;
  }
}
