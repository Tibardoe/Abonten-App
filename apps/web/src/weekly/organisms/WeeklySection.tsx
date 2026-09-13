import { weeklyParagraphs } from "@abonten/core/weekly/editorialText";
import { weeklySectionIcon } from "@abonten/core/weekly/sectionIcons";
import type { WeeklySection as WeeklySectionType } from "@abonten/types/weeklyType";
import WeeklyCarousel from "../molecules/WeeklyCarousel";
import WeeklyHeroItem from "../molecules/WeeklyHeroItem";
import WeeklyItemFrame from "../molecules/WeeklyItemFrame";
import WeeklyListItem from "../molecules/WeeklyListItem";

// One section of an edition. The layout comes from the editor's choice, so no
// section is hard-coded here; only how each layout looks is.
export default function WeeklySection({
  section,
  index,
}: {
  section: WeeklySectionType;
  index: number;
}) {
  const headingId = `weekly-section-${section.id}`;
  const icon = weeklySectionIcon(section.iconKey);
  const eager = index === 0;

  const header = (
    <div className="mb-3">
      <h2 id={headingId} className="text-lg font-semibold md:text-xl">
        {icon ? (
          <span aria-hidden className="mr-1.5">
            {icon}
          </span>
        ) : null}
        {section.title}
      </h2>
      {section.subtitle ? (
        <p className="mt-0.5 text-sm text-muted-foreground">
          {section.subtitle}
        </p>
      ) : null}
    </div>
  );

  if (section.layout === "editorial" || section.kind === "editorial") {
    const paragraphs = weeklyParagraphs(section.body);
    return (
      <section
        aria-labelledby={headingId}
        className="rounded-2xl border border-border bg-muted/40 p-5 md:p-6"
      >
        {header}
        <div className="max-w-3xl space-y-3 text-base leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={`${section.id}-${i}`} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      </section>
    );
  }

  if (section.items.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      {header}
      {section.layout === "hero" ? (
        <div className="space-y-4">
          {section.items.map((item, i) => (
            <WeeklyHeroItem
              key={item.id}
              item={item}
              priority={eager && i === 0}
            />
          ))}
        </div>
      ) : section.layout === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {section.items.map((item, i) => (
            <WeeklyItemFrame
              key={item.id}
              item={item}
              priority={eager && i < 4}
              reserveHeadline={section.items.some((it) => !!it.headline)}
            />
          ))}
        </ul>
      ) : section.layout === "list" ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {section.items.map((item) => (
            <WeeklyListItem key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <WeeklyCarousel
          items={section.items}
          label={section.title}
          eagerCount={eager ? 4 : 0}
        />
      )}
    </section>
  );
}
