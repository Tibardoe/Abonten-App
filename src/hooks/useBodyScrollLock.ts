"use client";

import { useLayoutEffect } from "react";

// Reference-counted so nested/stacked overlays (e.g. a confirm dialog opened
// on top of the Highlight Viewer) only unlock the page once the LAST one
// closes, instead of the first one closing prematurely re-enabling scroll.
let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyle: {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
} | null = null;
let savedHtmlOverflow = "";

function lockBodyScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    const { style } = document.body;
    savedBodyStyle = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };
    savedHtmlOverflow = document.documentElement.style.overflow;

    // Pinning the body at its current scroll offset (rather than just
    // `overflow: hidden`) is what stops iOS Safari from rubber-banding the
    // page behind a `position: fixed` modal — overflow alone doesn't
    // reliably block touch-driven scroll on iOS.
    style.position = "fixed";
    style.top = `-${savedScrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  lockCount++;
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && savedBodyStyle) {
    const { style } = document.body;
    style.position = savedBodyStyle.position;
    style.top = savedBodyStyle.top;
    style.left = savedBodyStyle.left;
    style.right = savedBodyStyle.right;
    style.width = savedBodyStyle.width;
    style.overflow = savedBodyStyle.overflow;
    document.documentElement.style.overflow = savedHtmlOverflow;
    savedBodyStyle = null;

    window.scrollTo(0, savedScrollY);
  }
}

/**
 * Locks background page scroll/interaction while `active` is true. Safe to
 * call from multiple simultaneously-mounted overlays (nested or stacked) —
 * the lock is only released once every caller has deactivated/unmounted.
 * Scroll containers inside the overlay itself (e.g. a modal's own
 * `overflow-y-scroll` panel) are unaffected, since only `<body>`/`<html>`
 * are pinned.
 */
export function useBodyScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;

    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [active]);
}
