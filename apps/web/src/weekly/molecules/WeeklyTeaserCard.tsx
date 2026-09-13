import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { WEEKLY_PRODUCT_NAME, WEEKLY_TAGLINE } from "@abonten/core/weekly/copy";
import { weeklySectionIcon } from "@abonten/core/weekly/sectionIcons";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { WeeklyTeaser } from "@abonten/types/weeklyType";
import Image from "next/image";
import Link from "next/link";

// The compact "Abonten Weekly" card at the top of Explore. One link, three
// small images, and the edition's own title. Only rendered while this week's
// edition is out for this visitor.
export default function WeeklyTeaserCard({ teaser }: { teaser: WeeklyTeaser }) {
  return (
    <Link
      href={teaser.href}
      className="group flex flex-col gap-4 rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-card to-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center md:p-5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <span aria-hidden className="mr-1">
            {weeklySectionIcon("sparkles")}
          </span>
          {WEEKLY_PRODUCT_NAME}
          {teaser.isFallbackScope ? " · Ghana" : ` · ${teaser.scopeName}`}
        </p>
        <p className="mt-1 line-clamp-1 text-lg font-semibold">
          {teaser.title}
        </p>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {teaser.subtitle ?? WEEKLY_TAGLINE}{" "}
          {formatWeekRange(teaser.weekStart)}.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {teaser.images.length > 0 ? (
          <div className="flex -space-x-3" aria-hidden>
            {teaser.images.map((img) => (
              <div
                key={img.publicId}
                className="relative h-12 w-12 overflow-hidden rounded-lg border-2 border-card bg-muted md:h-14 md:w-14"
              >
                <Image
                  src={buildCloudinaryUrl(img.publicId, img.version, {
                    width: 56,
                    height: 56,
                  })}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}
        <span className="whitespace-nowrap text-sm font-medium text-primary group-hover:underline">
          See all
          <span className="sr-only">
            {" "}
            {teaser.itemCount} picks in {WEEKLY_PRODUCT_NAME}
          </span>
        </span>
      </div>
    </Link>
  );
}
