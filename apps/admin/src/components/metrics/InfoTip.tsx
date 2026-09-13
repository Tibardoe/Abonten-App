"use client";

import { Info } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../ui";

// The console's one way to explain a term.
//
// A hover-only tooltip is invisible to anyone using a keyboard or a phone,
// so this is a "toggle tip": hovering or focusing shows it, clicking or
// tapping pins it open, and Escape, blur or a click outside closes it. The
// button carries an accessible name of its own, so a screen reader hears
// "What is Gross ticket sales? button" rather than an unlabelled icon.
//
// It is deliberately dependency-free (the console has no Radix) and takes
// only plain strings, so the definitions stay on the server and never ship
// to the browser as a bundle.

export type InfoTipProps = {
  /** What is being explained — used in the button's accessible name. */
  label: string;
  definition: string;
  /** Things that would mislead someone who trusted the label. */
  caveats?: string[];
  /** Where the figure comes from, in operator language. */
  source?: string;
  /** The window the figure covers, e.g. "Last 30 days". */
  period?: string;
  className?: string;
  children?: ReactNode;
};

export function InfoTip({
  label,
  definition,
  caveats,
  source,
  period,
  className,
}: InfoTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  // Horizontal nudge, in px, that keeps the panel inside the viewport.
  const [shift, setShift] = useState(0);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set while we move focus back to the button ourselves, so the focus
  // handler does not reopen the tip we have just closed.
  const restoringFocus = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
    setShift(0);
  }, []);

  // Escape closes wherever focus is, and a click anywhere else dismisses a
  // pinned tip — the behaviour people already expect from a popover. Focus
  // returns to the button only when it was in this tip (or nowhere), so a
  // pinned tip closing does not steal focus from wherever the person went.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const activeEl = document.activeElement;
      const focusWasHere =
        !activeEl ||
        activeEl === document.body ||
        wrapperRef.current?.contains(activeEl) === true;
      close();
      if (focusWasHere && activeEl !== buttonRef.current) {
        restoringFocus.current = true;
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  // Keep the panel on screen: flip above the button when it would run off
  // the bottom, and nudge it sideways when it would run off either edge (a
  // 400px phone cannot fit a 256px panel to the right of a button near the
  // right edge, nor to the left of one near the left edge). Measured after
  // paint so the server render and the first client render are identical.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const panel = panelRef.current;
      const anchor = wrapperRef.current;
      if (!panel || !anchor) return;
      // Measure against the button, not the panel's current position, so
      // the answer is the same whatever nudge or flip is already applied.
      const a = anchor.getBoundingClientRect();
      const height = panel.offsetHeight;
      const width = panel.offsetWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const viewportWidth = document.documentElement.clientWidth;
      const margin = 8;
      const gap = 6;
      const fitsBelow = a.bottom + gap + height <= viewportHeight - margin;
      const fitsAbove = a.top - gap - height >= margin;
      setPlacement(fitsBelow || !fitsAbove ? "bottom" : "top");
      let nudge = 0;
      if (a.left + width > viewportWidth - margin) {
        nudge = viewportWidth - margin - (a.left + width);
      }
      if (a.left + nudge < margin) nudge = margin - a.left;
      setShift(Math.round(nudge));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className={cn("relative inline-flex", className)}
      // Only a real mouse opens on hover: a tap fires pointerenter too, and
      // would leave a phone user with a tip they cannot dismiss.
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !pinned) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={pinned}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        onFocus={() => {
          if (restoringFocus.current) {
            restoringFocus.current = false;
            return;
          }
          setOpen(true);
        }}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        onClick={(e) => {
          // Never let the press reach whatever the button sits in (a card's
          // drill-down link, a form): opening a definition is all it does.
          e.preventDefault();
          e.stopPropagation();
          const next = !pinned;
          setPinned(next);
          setOpen(next || true);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={id}
          role="tooltip"
          data-placement={placement}
          className={cn(
            "absolute left-0 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-3 text-xs font-normal leading-relaxed text-popover-foreground shadow-lg",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-100",
            placement === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
          )}
          // `left`, not a transform: the enter animation owns `transform`
          // for its first 100ms and would override a nudge set there.
          style={shift ? { left: shift } : undefined}
        >
          <p className="font-medium text-foreground">{label}</p>
          <p className="mt-1">{definition}</p>
          {period ? (
            <p className="mt-1.5 text-muted-foreground">Period: {period}</p>
          ) : null}
          {caveats?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
          {source ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Read from {source}
            </p>
          ) : null}
          {pinned ? (
            <p className="sr-only">Press Escape to close this explanation.</p>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
