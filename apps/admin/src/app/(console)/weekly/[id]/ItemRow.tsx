"use client";

import { Badge, Button, cn } from "@/components/ui";
import { removeWeeklyItem, updateWeeklyItem } from "@/server/actions/weekly";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { WEEKLY_VALIDITY_LABEL } from "@abonten/core/weekly/copy";
import { sectionAccepts } from "@abonten/core/weekly/sectionKinds";
import type {
  WeeklyAdminItem,
  WeeklyAdminSection,
} from "@abonten/types/weeklyType";
import { ArrowDown, ArrowUp, Pin } from "lucide-react";
import { useEffect, useState } from "react";
import { formatOpsDateTime } from "../format";
import { fieldClass, useEditor } from "./EditorContext";

function describe(item: WeeklyAdminItem) {
  if (item.event) {
    const first =
      item.event.occurrences?.[0]?.starts_at ?? item.event.starts_at;
    return {
      title: item.event.title,
      meta: [
        first ? formatOpsDateTime(String(first)) : null,
        item.event.address?.full_address,
      ]
        .filter(Boolean)
        .join(" · "),
      image: item.event.flyer_public_id
        ? buildCloudinaryUrl(
            item.event.flyer_public_id,
            item.event.flyer_version,
            { width: 56, height: 56 },
          )
        : null,
    };
  }
  if (item.place) {
    return {
      title: item.place.name,
      meta: [item.place.category_name, item.place.verified ? "Verified" : null]
        .filter(Boolean)
        .join(" · "),
      image: item.place.cover_public_id
        ? buildCloudinaryUrl(
            item.place.cover_public_id,
            item.place.cover_version,
            {
              width: 56,
              height: 56,
            },
          )
        : null,
    };
  }
  return {
    title: "Listing no longer available",
    meta: item.subjectId,
    image: null,
  };
}

export function ItemRow({
  item,
  section,
  allSections,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  item: WeeklyAdminItem;
  section: WeeklyAdminSection;
  allSections: WeeklyAdminSection[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { editionId, canEdit, pending, run } = useEditor();
  const [headline, setHeadline] = useState(item.headline ?? "");
  const [blurb, setBlurb] = useState(item.blurb ?? "");

  useEffect(() => {
    setHeadline(item.headline ?? "");
    setBlurb(item.blurb ?? "");
  }, [item.headline, item.blurb]);

  const d = describe(item);
  const dirty =
    headline !== (item.headline ?? "") || blurb !== (item.blurb ?? "");
  const moveTargets = allSections.filter(
    (s) =>
      s.id !== section.id &&
      s.kind !== "editorial" &&
      sectionAccepts(s.subjectScope, item.subjectType),
  );

  const update = (
    patch: Record<string, unknown>,
    extra: { moveToSectionId?: string } = {},
    success = "Saved.",
  ) =>
    run(
      (version) =>
        updateWeeklyItem({
          editionId,
          expectedVersion: version,
          itemId: item.id,
          patch,
          ...extra,
        }),
      { success },
    );

  const detailHref = item.event
    ? `/events/${item.subjectId}`
    : `/places/${item.subjectId}`;

  return (
    <li
      className={cn(
        "rounded border border-border p-2",
        item.validity && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-start gap-3">
        {d.image ? (
          <img
            src={d.image}
            alt=""
            width={56}
            height={56}
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <a href={detailHref} className="hover:underline">
              {d.title}
            </a>
            <Badge>{item.subjectType === "event" ? "Event" : "Place"}</Badge>
            {item.pinned ? (
              <Badge tone="info">
                <Pin className="h-3 w-3" aria-hidden /> Pinned
              </Badge>
            ) : null}
            {item.validity ? (
              <Badge tone="danger">
                Not shown:{" "}
                {WEEKLY_VALIDITY_LABEL[item.validity] ?? item.validity}
              </Badge>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">{d.meta}</p>

          {canEdit ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="sr-only">Headline for {d.title}</span>
                <input
                  value={headline}
                  maxLength={80}
                  placeholder="Headline (optional)"
                  onChange={(e) => setHeadline(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-xs">
                <span className="sr-only">Note for {d.title}</span>
                <input
                  value={blurb}
                  maxLength={200}
                  placeholder="Short note (optional)"
                  onChange={(e) => setBlurb(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
          ) : item.headline || item.blurb ? (
            <p className="mt-1 text-xs">
              {item.headline}
              {item.headline && item.blurb ? " — " : ""}
              {item.blurb}
            </p>
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Move ${d.title} up`}
            disabled={pending || !canMoveUp}
            onClick={onMoveUp}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Move ${d.title} down`}
            disabled={pending || !canMoveDown}
            onClick={onMoveDown}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !dirty}
            onClick={() =>
              update({ headline: headline || null, blurb: blurb || null })
            }
          >
            Save text
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              update(
                { pinned: !item.pinned },
                {},
                item.pinned ? "Unpinned." : "Pinned.",
              )
            }
          >
            {item.pinned ? "Unpin" : "Pin"}
          </Button>
          {moveTargets.length > 0 ? (
            <label className="text-xs">
              <span className="sr-only">Move {d.title} to another section</span>
              <select
                value=""
                disabled={pending}
                onChange={(e) =>
                  e.target.value &&
                  update(
                    {},
                    { moveToSectionId: e.target.value },
                    "Listing moved.",
                  )
                }
                className={cn(fieldClass, "h-8 w-auto py-0")}
              >
                <option value="">Move to…</option>
                {moveTargets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={pending}
            onClick={() =>
              run(
                (version) =>
                  removeWeeklyItem({
                    editionId,
                    expectedVersion: version,
                    itemId: item.id,
                  }),
                { success: "Listing removed." },
              )
            }
          >
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}
