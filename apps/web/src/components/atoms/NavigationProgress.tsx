"use client";

import {
  NAVIGATION_START_EVENT,
  type NavigationStartDetail,
  leavesCurrentPage,
} from "@/lib/navigationSignal";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

// The thin bar at the top of the window while a page is on its way.
//
// Most pages here are rendered on the server for the person asking, so a
// click on a link shows nothing until the answer arrives: on a slow
// connection the site looked as if it had ignored the click. Twenty pages
// have a skeleton of their own (loading.tsx); this covers every navigation,
// whatever started it, and stays out of the way of the fast ones.

// A navigation that finishes sooner than this never shows the bar.
const SHOW_AFTER_MS = 150;
// A navigation that never arrives (cancelled, redirected back to the page
// already open) must not leave the bar running.
const GIVE_UP_AFTER_MS = 12_000;
// How long the finished bar takes to fade.
const FADE_MS = 300;

type Phase = "idle" | "running" | "done";

// The address the page is showing. Reading the query string needs a
// Suspense boundary on a prerendered page, and what is inside one starts
// after the rest of the page: so only this watcher is inside it, and the
// bar's listener is ready as soon as the shell is (a link clicked right
// after the page loaded used to get no bar).
function AddressWatcher({ onChange }: { onChange: () => void }) {
  const address = `${usePathname()}?${useSearchParams().toString()}`;
  const shown = useRef(address);
  useEffect(() => {
    if (shown.current === address) return;
    shown.current = address;
    onChange();
  }, [address, onChange]);
  return null;
}

export default function NavigationProgress() {
  const [phase, setPhase] = useState<Phase>("idle");
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    showTimer.current = null;
    giveUpTimer.current = null;
  }, []);

  useEffect(() => {
    const onStart = (event: Event) => {
      const { url } = (event as CustomEvent<NavigationStartDetail>).detail;
      if (!leavesCurrentPage(url, window.location.href)) return;
      clearTimers();
      showTimer.current = setTimeout(() => setPhase("running"), SHOW_AFTER_MS);
      giveUpTimer.current = setTimeout(() => {
        clearTimers();
        setPhase("idle");
      }, GIVE_UP_AFTER_MS);
    };
    window.addEventListener(NAVIGATION_START_EVENT, onStart);
    return () => {
      window.removeEventListener(NAVIGATION_START_EVENT, onStart);
      clearTimers();
    };
  }, [clearTimers]);

  // The address changed: the new page is on screen.
  const arrived = useCallback(() => {
    clearTimers();
    setPhase((current) => (current === "running" ? "done" : "idle"));
  }, [clearTimers]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => setPhase("idle"), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <>
      <Suspense fallback={null}>
        <AddressWatcher onChange={arrived} />
      </Suspense>
      {phase === "idle" ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
        >
          <div
            className={
              phase === "running"
                ? "navigation-progress-running h-full origin-left bg-primary"
                : "navigation-progress-done h-full origin-left bg-primary"
            }
          />
        </div>
      )}
    </>
  );
}
