"use client";

import type { ShowcaseWall } from "@abonten/types/showcaseType";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import ShowcaseTile from "../molecules/ShowcaseTile";

// The "See all" page of the "On Abonten" wall: the same tiles, standing
// still, in two groups (hosts, then places). A group appears when its row
// would show on the wall. Nothing moves here.
export default function ShowcaseDirectory({
  wall,
}: {
  wall: ShowcaseWall | null;
}) {
  const t = useTranslations("showcase");
  const hostsId = useId();
  const placesId = useId();
  // One clock for every tile, fixed for this visit.
  const [now] = useState(() => new Date());

  const groups = wall
    ? [
        { id: hostsId, title: t("hosts"), tiles: wall.hosts },
        { id: placesId, title: t("places"), tiles: wall.places },
      ].filter((g) => g.tiles.length > 0)
    : [];

  return (
    <section className="space-y-8 pb-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold md:text-3xl">{t("title")}</h1>
        <p className="max-w-2xl text-muted-foreground text-pretty">
          {wall?.regionName
            ? t("directoryIntroIn", { city: wall.regionName })
            : t("directoryIntro")}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("directoryEmpty")}
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={group.id}
            className="space-y-3"
          >
            <h2 id={group.id} className="text-lg font-semibold">
              {group.title}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.tiles.map((tile) => (
                <li key={tile.entryId}>
                  <ShowcaseTile tile={tile} now={now} className="w-full" />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
