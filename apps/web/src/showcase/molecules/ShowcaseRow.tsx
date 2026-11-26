"use client";

import { cn } from "@/components/lib/utils";
import type { ShowcaseTile as Tile } from "@abonten/types/showcaseType";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import ShowcaseTile from "./ShowcaseTile";

// One row of the "On Abonten" wall, drifting slowly sideways.
//
// The track holds the row twice and moves left by half its width per loop
// (a CSS transform the browser's compositor runs: no script per frame), so
// the second copy takes the first one's place without a seam. A short row
// is repeated inside each half until a half is wider than a wide screen.
// Only the first set is in the accessibility tree and the tab order; every
// repeat is aria-hidden and out of the tab order (`HiddenCopy`) but still
// takes clicks: as the row drifts, the tiles on screen are often a repeat,
// and `inert` there made a click on a tile or on Follow do nothing.
//
// It stops while the pointer is over it, while something in it has focus,
// while a finger is on it (and a moment after), when the visitor pressed
// Pause, and while it is off screen (the parent says so). With reduced
// motion asked for, it is a plain row that scrolls sideways and never moves
// by itself (`still`).

/** Tiles per half before it is wider than a wide screen (60 rem each half). */
const MIN_TILES_PER_HALF = 8;
/** Seconds per tile: a slow drift. */
const SECONDS_PER_TILE = 7;
const MIN_SECONDS = 40;
const TOUCH_GRACE_MS = 2500;

// A repeat of the row: hidden from screen readers and taken out of the tab
// order, but a mouse or a finger can still use it. Links and buttons inside
// get tabindex -1, and again whenever the tiles re-render (Follow turning
// into Following swaps the button).
function HiddenCopy({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const takeOutOfTabOrder = () => {
      for (const el of root.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      )) {
        if (el.getAttribute("tabindex") !== "-1") {
          el.setAttribute("tabindex", "-1");
        }
      }
    };
    takeOutOfTabOrder();
    const observer = new MutationObserver(takeOutOfTabOrder);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["tabindex"],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} aria-hidden="true">
      {children}
    </div>
  );
}

function Half({
  tiles,
  copies,
  labelledBy,
  hidden,
  now,
}: {
  tiles: Tile[];
  copies: number;
  labelledBy?: string;
  hidden: boolean;
  now: Date;
}) {
  const repeats = Array.from({ length: copies - 1 }, (_, i) => i + 1);
  const first = (
    <ul
      className="flex shrink-0 gap-3"
      aria-labelledby={hidden ? undefined : labelledBy}
    >
      {tiles.map((tile) => (
        <li key={tile.entryId}>
          <ShowcaseTile tile={tile} now={now} />
        </li>
      ))}
    </ul>
  );
  const more =
    repeats.length > 0 ? (
      <ul className="flex shrink-0 gap-3">
        {repeats.flatMap((copy) =>
          tiles.map((tile) => (
            <li key={`${copy}-${tile.entryId}`}>
              <ShowcaseTile tile={tile} now={now} />
            </li>
          )),
        )}
      </ul>
    ) : null;

  if (hidden) {
    return (
      <HiddenCopy className="flex shrink-0 gap-3 pr-3">
        {first}
        {more}
      </HiddenCopy>
    );
  }
  return (
    <div className="flex shrink-0 gap-3 pr-3">
      {first}
      {more ? (
        <HiddenCopy className="flex shrink-0 gap-3">{more}</HiddenCopy>
      ) : null}
    </div>
  );
}

export default function ShowcaseRow({
  title,
  tiles,
  reverse = false,
  paused,
  still,
  now,
}: {
  title: string;
  tiles: Tile[];
  /** Drift the other way (the second row). */
  reverse?: boolean;
  /** Stopped by the Pause button or because the wall is off screen. */
  paused: boolean;
  /** Reduced motion: a plain sideways-scrolling row. */
  still: boolean;
  now: Date;
}) {
  const headingId = useId();
  const [touched, setTouched] = useState(false);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (release.current) clearTimeout(release.current);
    },
    [],
  );

  if (tiles.length === 0) return null;

  const heading = (
    <h3
      id={headingId}
      className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {title}
    </h3>
  );

  if (still) {
    return (
      <div>
        {heading}
        <ul
          aria-labelledby={headingId}
          className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
        >
          {tiles.map((tile) => (
            <li key={tile.entryId}>
              <ShowcaseTile tile={tile} now={now} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const copies = Math.max(1, Math.ceil(MIN_TILES_PER_HALF / tiles.length));
  const duration = Math.max(
    MIN_SECONDS,
    tiles.length * copies * SECONDS_PER_TILE,
  );

  const hold = () => {
    if (release.current) clearTimeout(release.current);
    setTouched(true);
  };
  const letGo = () => {
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => setTouched(false), TOUCH_GRACE_MS);
  };

  return (
    <div>
      {heading}
      <div
        className="showcase-row relative overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_3%,black_97%,transparent)]"
        data-paused={paused || touched ? "true" : "false"}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") hold();
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") letGo();
        }}
        onPointerCancel={letGo}
      >
        <div
          className={cn("showcase-track flex w-max")}
          data-reverse={reverse ? "true" : "false"}
          style={{ "--showcase-duration": `${duration}s` } as CSSProperties}
        >
          <Half
            tiles={tiles}
            copies={copies}
            labelledBy={headingId}
            hidden={false}
            now={now}
          />
          <Half tiles={tiles} copies={copies} hidden now={now} />
        </div>
      </div>
    </div>
  );
}
