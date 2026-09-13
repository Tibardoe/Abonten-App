import { weeklyBannerSlides } from "@abonten/core/weekly/bannerSlides";
import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import { weeklyParagraphs } from "@abonten/core/weekly/editorialText";
import { weeklySectionIcon } from "@abonten/core/weekly/sectionIcons";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { WeeklyEditionDocument } from "@abonten/types/weeklyType";
import { FiArrowDown, FiCalendar, FiInfo } from "react-icons/fi";
import WeeklyShareButton from "../molecules/WeeklyShareButton";
import WeeklyBanner from "./WeeklyBanner";
import WeeklySection from "./WeeklySection";

// A whole edition: an immersive masthead with the edition's listings rotating
// behind the title, the editor's introduction and honest notices about what is
// being shown, then the sections in the editor's order. Works both
// server-rendered (the cached public pages) and client-rendered (staff and
// beta, previews).
export default function WeeklyEditionView({
  doc,
  preview = false,
}: {
  doc: WeeklyEditionDocument;
  preview?: boolean;
}) {
  const e = doc.edition;
  const intro = weeklyParagraphs(e.intro);
  const slides = weeklyBannerSlides(doc.sections);
  const pickCount = doc.sections.reduce((n, s) => n + s.items.length, 0);

  const notices = [
    doc.isFallbackScope
      ? "There is no edition for your area this week, so these are Ghana-wide picks."
      : null,
    doc.isPreviousWeek
      ? "This week's edition is on its way. Here is last week's."
      : null,
    e.weekIsOver && !doc.isPreviousWeek
      ? "A past edition. Some events have already happened."
      : null,
  ].filter((n): n is string => !!n);

  return (
    <article className="mx-auto flex w-full max-w-7xl flex-col gap-8 md:gap-12">
      <WeeklyBanner
        variant="masthead"
        slides={slides}
        label={`${WEEKLY_PRODUCT_NAME}, ${e.scopeName}`}
        priority
        eyebrow={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white ring-1 ring-white/20 backdrop-blur-md">
              <span aria-hidden>{weeklySectionIcon("sparkles")}</span>
              {WEEKLY_PRODUCT_NAME}
              <span aria-hidden className="text-white/50">
                ·
              </span>
              {e.scopeName}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-md">
              <FiCalendar aria-hidden className="h-3.5 w-3.5" />
              <time dateTime={e.weekStart}>{formatWeekRange(e.weekStart)}</time>
            </span>
          </>
        }
      >
        <h1 className="text-balance text-4xl font-extrabold leading-[1.02] tracking-tight drop-shadow-sm sm:text-5xl lg:text-6xl">
          {e.title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85 md:text-lg">
          {e.subtitle ?? WEEKLY_TAGLINE}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="#weekly-picks"
            className="inline-flex h-11 items-center gap-3 rounded-full bg-white pl-5 pr-1.5 text-sm font-semibold text-slate-950 shadow-lg shadow-black/20 transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Browse {pickCount} {pickCount === 1 ? "pick" : "picks"}
            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-white">
              <FiArrowDown aria-hidden className="h-4 w-4" />
            </span>
          </a>
          {!preview ? (
            <WeeklyShareButton
              tone="onImage"
              scopeSlug={e.scopeSlug}
              scopeName={e.scopeName}
              weekStart={e.weekStart}
              title={e.title}
            />
          ) : null}
        </div>
      </WeeklyBanner>

      {intro.length > 0 || notices.length > 0 ? (
        <div
          className={
            intro.length > 0 && notices.length > 0
              ? "grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
              : "grid gap-4"
          }
        >
          {intro.length > 0 ? (
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8">
              <span
                aria-hidden
                className="pointer-events-none absolute -left-1 -top-6 select-none font-serif text-[9rem] leading-none text-primary/15"
              >
                &ldquo;
              </span>
              <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                From the editors
              </p>
              <div className="relative mt-3 max-w-3xl space-y-3 text-base leading-relaxed text-foreground/90 md:text-lg">
                {intro.map((p) => (
                  <p key={p} className="whitespace-pre-line">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {notices.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {notices.map((n) => (
                <li
                  key={n}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-4 text-sm"
                >
                  <FiInfo
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        id="weekly-picks"
        className="flex scroll-mt-24 flex-col gap-10 md:gap-14"
      >
        {doc.sections.map((section, index) => (
          <WeeklySection key={section.id} section={section} index={index} />
        ))}
      </div>
    </article>
  );
}
