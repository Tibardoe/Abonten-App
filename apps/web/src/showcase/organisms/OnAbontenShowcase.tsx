"use client";

import { cn } from "@/components/lib/utils";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiArrowRight, FiPause, FiPlay } from "react-icons/fi";
import { useShowcaseWall } from "../hooks/useShowcaseWall";
import ShowcaseRow from "../molecules/ShowcaseRow";

// "On Abonten": the hosts and places that are on Abonten, in two rows
// drifting slowly in opposite directions (docs/architecture/showcase.md).
// Staff pick who is on it; a row shows only when enough of them qualify,
// and the whole section hides when neither row does, when it is not on for
// this visitor, or when the read failed (never "nobody is here").
//
// Motion manners (WCAG 2.2.2): a slow drift; a visible Pause / Play button;
// the rows stop under the pointer, on focus, under a finger and while the
// section is off screen; with reduced motion asked for, nothing moves (two
// plain rows that scroll sideways).
//
// The wording is "On Abonten": never "partners" or "trusted by". Nothing
// here says Abonten endorses anyone or has an agreement with them
// (docs/LEGAL_REVIEW_REQUIRED.md).
export default function OnAbontenShowcase({
  lat,
  lng,
  className,
}: {
  lat?: number | null;
  lng?: number | null;
  className?: string;
}) {
  const t = useTranslations("showcase");
  const headingId = useId();
  const { data: wall } = useShowcaseWall({ lat, lng });
  const reducedMotion = usePrefersReducedMotion();
  const [userPaused, setUserPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const root = useRef<HTMLElement | null>(null);
  // One clock for every tile, renewed with the data.
  const now = useMemo(() => (wall ? new Date() : new Date(0)), [wall]);

  const visible = !!wall && (wall.hosts.length > 0 || wall.places.length > 0);

  useEffect(() => {
    const node = root.current;
    if (!visible || !node || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry?.isIntersecting ?? true),
      { rootMargin: "64px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  if (!wall || !visible) return null;

  const seeAll =
    lat != null && lng != null
      ? `/on-abonten?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
      : "/on-abonten";
  const paused = userPaused || !onScreen;

  return (
    <section
      ref={root}
      aria-labelledby={headingId}
      className={cn("space-y-4", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-xl font-bold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reducedMotion ? null : (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-pressed={userPaused}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {userPaused ? (
                <FiPlay aria-hidden className="h-4 w-4" />
              ) : (
                <FiPause aria-hidden className="h-4 w-4" />
              )}
              {userPaused ? t("play") : t("pause")}
            </button>
          )}
          <Link
            href={seeAll}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {t("seeAll")}
            <FiArrowRight aria-hidden />
          </Link>
        </div>
      </div>

      <ShowcaseRow
        title={t("hosts")}
        tiles={wall.hosts}
        paused={paused}
        still={reducedMotion}
        now={now}
      />
      <ShowcaseRow
        title={t("places")}
        tiles={wall.places}
        reverse
        paused={paused}
        still={reducedMotion}
        now={now}
      />
    </section>
  );
}
