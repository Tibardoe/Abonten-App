// "A navigation has started", said once for the whole page.
//
// Next.js tells the app when a navigation starts through a hook in
// instrumentation-client.ts (onRouterTransitionStart): a link, router.push,
// router.replace and the Back button all pass through it. That file is not
// a component, so it says so here, and the progress bar listens
// (components/atoms/NavigationProgress.tsx).

export const NAVIGATION_START_EVENT = "abonten:navigation-start";

export type NavigationStartDetail = {
  /** The address being opened, as the router was given it. */
  url: string;
};

export function announceNavigationStart(url: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NavigationStartDetail>(NAVIGATION_START_EVENT, {
      detail: { url },
    }),
  );
}

/**
 * Whether opening `url` shows a different page from the one at `current`.
 * A link to the page already open, or to a heading on it (#section),
 * changes nothing the progress bar could wait for.
 */
export function leavesCurrentPage(url: string, current: string): boolean {
  try {
    const from = new URL(current);
    const to = new URL(url, from);
    if (to.origin !== from.origin) return true;
    return to.pathname !== from.pathname || to.search !== from.search;
  } catch {
    return false;
  }
}
