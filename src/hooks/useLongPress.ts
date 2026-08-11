import { useRef } from "react";

type UseLongPressOptions = {
  onLongPress: () => void;
  onTap?: () => void;
  delay?: number;
  moveThreshold?: number;
};

/**
 * WhatsApp-Status-like long press: holding still for `delay`ms triggers
 * `onLongPress`; a short tap (released before `delay`ms) triggers `onTap`.
 * Movement past `moveThreshold` before the timer fires cancels the long
 * press so scrolling isn't misread as a hold, and a fired long press
 * suppresses the emulated click so releasing doesn't also trigger `onTap`.
 */
export function useLongPress({
  onLongPress,
  onTap,
  delay = 500,
  moveThreshold = 10,
}: UseLongPressOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };
    longPressFiredRef.current = false;
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onLongPress();
    }, delay);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!startPos.current || longPressFiredRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startPos.current.x;
    const dy = touch.clientY - startPos.current.y;
    if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) {
      clearTimer();
    }
  };

  const onTouchEnd = () => {
    clearTimer();
    startPos.current = null;
  };

  const onClick = (e: React.MouseEvent) => {
    if (longPressFiredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFiredRef.current = false;
      return;
    }
    onTap?.();
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onClick };
}
