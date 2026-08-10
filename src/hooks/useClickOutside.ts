import { type RefObject, useEffect } from "react";

/**
 * Calls `onOutsideClick` when a pointer event lands outside every element in `refs`.
 * Uses "mousedown"/"touchstart" (not "click") so it fires before the target's own
 * click handler, matching the moment a suggestion dropdown should actually close.
 */
export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  onOutsideClick: () => void,
) {
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      const isInside = refs.some((ref) => ref.current?.contains(target));

      if (!isInside) {
        onOutsideClick();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [refs, onOutsideClick]);
}
