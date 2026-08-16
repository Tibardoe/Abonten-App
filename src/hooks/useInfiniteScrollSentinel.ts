import { useEffect, useRef } from "react";

/**
 * Returns a ref to attach to a sentinel element near the end of a list.
 * Fires `onIntersect` once when the sentinel enters the viewport (with a
 * prefetch margin so the next page starts loading before the user hits a
 * hard stop). Disabled automatically while a fetch is already in flight or
 * once there's nothing left to load, so it never triggers duplicate or
 * unnecessary requests.
 */
export function useInfiniteScrollSentinel({
  onIntersect,
  enabled,
}: {
  onIntersect: () => void;
  enabled: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [enabled, onIntersect]);

  return sentinelRef;
}
