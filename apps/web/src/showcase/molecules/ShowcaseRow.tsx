"use client";

import { cn } from "@/components/lib/utils";
import type { ShowcaseTile as Tile } from "@abonten/types/showcaseType";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import ShowcaseTile from "./ShowcaseTile";

// One row of the "On Abonten" wall, drifting slowly sideways.
//
// The track holds the row twice and moves left by half its width per loop
// (a CSS transform the browser's compositor runs: no script per frame), so
// the second copy takes the first one's place without a seam. A short row
// is repeated inside each half until a half is wider than a wide screen.
// Only the first set is in the accessibility tree and the tab order; every
// repeat is aria-hidden and inert.
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
  return (
    <div
      className="flex shrink-0 gap-3 pr-3"
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
    >
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
      {repeats.length > 0 ? (
        <ul className="flex shrink-0 gap-3" aria-hidden inert>
          {repeats.flatMap((copy) =>
            tiles.map((tile) => (
              <li key={`${copy}-${tile.entryId}`}>
                <ShowcaseTile tile={tile} now={now} />
              </li>
            )),
          )}
        </ul>
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
