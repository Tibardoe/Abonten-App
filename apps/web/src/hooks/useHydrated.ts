"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and while React is attaching to the server's HTML,
 * true from then on (and straight away on a page reached by a link).
 *
 * A component that reads something the server could not know (the query
 * cache, the session) must show what the server showed until this turns
 * true. Checking "is there data yet?" is not enough: the part of a page
 * inside a Suspense boundary is attached later than the header, and by then
 * a query the header started may already have its answer, so the same
 * component would render differently from its own HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
