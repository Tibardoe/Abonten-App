"use client";

import { Badge, Button, cn } from "@/components/ui";
import { addWeeklyItem, searchWeeklySubjects } from "@/server/actions/weekly";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { WEEKLY_VALIDITY_LABEL } from "@abonten/core/weekly/copy";
import type {
  WeeklyAdminSection,
  WeeklySubjectOption,
} from "@abonten/types/weeklyType";
import { useId, useState, useTransition } from "react";
import { formatAccraDateTime } from "../format";
import { fieldClass, useEditor } from "./EditorContext";

// Find a listing to add: a search phrase, an event code, a pasted
// abontenhub.com/events/… or /places/… link, or a listing id. Listings that
// cannot be featured are shown with the reason and cannot be added.

export function ItemPicker({ section }: { section: WeeklyAdminSection }) {
  const { editionId, pending, run } = useEditor();
  const [searching, startSearch] = useTransition();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WeeklySubjectOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const subjectType =
    section.subjectScope === "events"
      ? "event"
      : section.subjectScope === "places"
        ? "place"
        : "any";
  const already = new Set(section.items.map((i) => i.subjectId));

  const search = () =>
    startSearch(async () => {
      setError(null);
      const res = await searchWeeklySubjects({ q, subjectType });
      if (res.status === 200 && "data" in res) {
        setResults((res.data as WeeklySubjectOption[]) ?? []);
      } else {
        setResults(null);
        setError(res.message ?? "Search failed.");
      }
    });

  return (
    <div className="rounded border border-dashed border-border p-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) search();
        }}
      >
        <label htmlFor={inputId} className="block min-w-[12rem] flex-1 text-xs">
          <span className="font-medium">
            {subjectType === "any"
              ? "Add an event or place"
              : subjectType === "event"
                ? "Add an event"
                : "Add a place"}
          </span>
          <input
            id={inputId}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, event code or link"
            className={cn(fieldClass, "mt-1")}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={searching || q.trim().length < 2}
        >
          {searching ? "Searching…" : "Search"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {results ? (
        results.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            Nothing found. Search only finds published listings.
          </p>
        ) : (
          <ul className="mt-2 space-y-1" aria-live="polite">
            {results.map((r) => {
              const inSection = already.has(r.subjectId);
              return (
                <li
                  key={`${r.subjectType}:${r.subjectId}`}
                  className="flex items-center gap-2 text-xs"
                >
                  {r.imagePublicId ? (
                    <img
                      src={buildCloudinaryUrl(r.imagePublicId, r.imageVersion, {
                        width: 40,
                        height: 40,
                      })}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {r.label}{" "}
                      <Badge>
                        {r.subjectType === "event" ? "Event" : "Place"}
                      </Badge>
                    </p>
                    <p className="truncate text-muted-foreground">
                      {[
                        r.startsAt ? formatAccraDateTime(r.startsAt) : null,
                        r.sublabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.validity ? (
                      <p className="text-destructive">
                        Cannot be featured: {WEEKLY_VALIDITY_LABEL[r.validity]}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    disabled={pending || inSection || !!r.validity}
                    onClick={() =>
                      run(
                        (version) =>
                          addWeeklyItem({
                            editionId,
                            expectedVersion: version,
                            sectionId: section.id,
                            subjectType: r.subjectType,
                            subjectId: r.subjectId,
                          }),
                        { success: `Added ${r.label}.` },
                      )
                    }
                  >
                    {inSection ? "Added" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
