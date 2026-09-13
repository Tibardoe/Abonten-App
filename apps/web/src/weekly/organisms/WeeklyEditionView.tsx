import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import { weeklyParagraphs } from "@abonten/core/weekly/editorialText";
import { weeklySectionIcon } from "@abonten/core/weekly/sectionIcons";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { WeeklyEditionDocument } from "@abonten/types/weeklyType";
import WeeklyShareButton from "../molecules/WeeklyShareButton";
import WeeklySection from "./WeeklySection";

// A whole edition: masthead, honest notices about what is being shown, and the
// sections in the editor's order. Works both server-rendered (the cached
// public pages) and client-rendered (staff and beta, previews).
export default function WeeklyEditionView({
  doc,
  preview = false,
}: {
  doc: WeeklyEditionDocument;
  preview?: boolean;
}) {
  const e = doc.edition;
  const intro = weeklyParagraphs(e.intro);

  return (
    <article className="mx-auto flex w-full max-w-7xl flex-col gap-8 md:gap-10">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <span aria-hidden className="mr-1">
            {weeklySectionIcon("sparkles")}
          </span>
          {WEEKLY_PRODUCT_NAME} · {e.scopeName}
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight md:text-4xl">
          {e.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <time dateTime={e.weekStart}>{formatWeekRange(e.weekStart)}</time>
        </p>
        <p className="mt-3 max-w-3xl text-base md:text-lg">
          {e.subtitle ?? WEEKLY_TAGLINE}
        </p>
        {intro.length > 0 ? (
          <div className="mt-3 max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground md:text-base">
            {intro.map((p) => (
              <p key={p} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        ) : null}

        {doc.isFallbackScope || doc.isPreviousWeek || e.weekIsOver ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-xs">
            {doc.isFallbackScope ? (
              <li className="rounded-full bg-muted px-3 py-1">
                There is no edition for your area this week, so these are
                Ghana-wide picks.
              </li>
            ) : null}
            {doc.isPreviousWeek ? (
              <li className="rounded-full bg-muted px-3 py-1">
                This week&apos;s edition is on its way. Here is last
                week&apos;s.
              </li>
            ) : null}
            {e.weekIsOver && !doc.isPreviousWeek ? (
              <li className="rounded-full bg-muted px-3 py-1">
                A past edition. Some events have already happened.
              </li>
            ) : null}
          </ul>
        ) : null}

        {!preview ? (
          <div className="mt-5">
            <WeeklyShareButton
              scopeSlug={e.scopeSlug}
              scopeName={e.scopeName}
              weekStart={e.weekStart}
              title={e.title}
            />
          </div>
        ) : null}
      </header>

      {doc.sections.map((section, index) => (
        <WeeklySection key={section.id} section={section} index={index} />
      ))}
    </article>
  );
}
