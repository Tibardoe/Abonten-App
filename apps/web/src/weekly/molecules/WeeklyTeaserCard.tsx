import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import { weeklySectionIcon } from "@abonten/core/weekly/sectionIcons";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { WeeklyTeaser } from "@abonten/types/weeklyType";
import { FiArrowRight, FiCalendar } from "react-icons/fi";
import WeeklyBanner from "../organisms/WeeklyBanner";

// The "Abonten Weekly" banner at the top of Explore. This week's listings
// rotate behind the edition's title; the whole banner opens the edition and
// the caption opens the listing on show. Only rendered while this week's
// edition is out for this visitor.
export default function WeeklyTeaserCard({ teaser }: { teaser: WeeklyTeaser }) {
  // A fallback edition is the country-wide one; its scope name is the country.
  const area = teaser.scopeName;
  const week = formatWeekRange(teaser.weekStart);
  const picks = `${teaser.itemCount} ${teaser.itemCount === 1 ? "pick" : "picks"}`;

  return (
    <WeeklyBanner
      variant="teaser"
      slides={teaser.slides ?? []}
      href={teaser.href}
      label={`${WEEKLY_PRODUCT_NAME}, ${area}`}
      linkLabel={`Open ${WEEKLY_PRODUCT_NAME} for ${area}: ${teaser.title}, ${week}, ${picks}`}
      priority
      eyebrow={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white ring-1 ring-white/20 backdrop-blur-md">
            <span aria-hidden>{weeklySectionIcon("sparkles")}</span>
            {WEEKLY_PRODUCT_NAME}
            <span aria-hidden className="text-white/50">
              ·
            </span>
            <span>{area}</span>
          </span>
          {teaser.isFallbackScope ? (
            <span className="rounded-full bg-black/35 px-3 py-1.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-md">
              {teaser.scopeName}-wide picks
            </span>
          ) : null}
        </>
      }
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 sm:text-sm">
        <FiCalendar aria-hidden className="h-3.5 w-3.5" />
        <time dateTime={teaser.weekStart}>{week}</time>
        <span aria-hidden className="text-white/40">
          •
        </span>
        {picks}
      </p>
      <h2 className="mt-2 line-clamp-2 text-balance text-3xl font-extrabold leading-[1.05] tracking-tight drop-shadow-sm sm:text-4xl lg:text-5xl">
        {teaser.title}
      </h2>
      <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
        {teaser.subtitle ?? WEEKLY_TAGLINE}
      </p>
      <span
        aria-hidden
        className="mt-5 inline-flex items-center gap-3 rounded-full bg-white py-1.5 pl-5 pr-1.5 text-sm font-semibold text-slate-950 shadow-lg shadow-black/20 transition-colors group-hover/banner:bg-primary group-hover/banner:text-primary-foreground"
      >
        See this week&apos;s picks
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-white transition-transform duration-300 group-hover/banner:translate-x-1 motion-reduce:transition-none">
          <FiArrowRight className="h-4 w-4" />
        </span>
      </span>
    </WeeklyBanner>
  );
}
