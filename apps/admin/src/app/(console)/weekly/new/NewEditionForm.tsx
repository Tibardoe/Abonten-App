"use client";

import { Button, Card, cn } from "@/components/ui";
import { createWeeklyEdition } from "@/server/actions/weekly";
import { WEEKLY_DEFAULT_TITLE } from "@abonten/core/weekly/copy";
import { formatWeekRange, weekStartFor } from "@abonten/core/weekly/week";
import type {
  WeeklyEditionListRow,
  WeeklyScope,
} from "@abonten/types/weeklyType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

export function NewEditionForm({
  scopes,
  editions,
  defaultWeek,
}: {
  scopes: WeeklyScope[];
  editions: WeeklyEditionListRow[];
  defaultWeek: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState(scopes[0]?.id ?? "");
  const [week, setWeek] = useState(defaultWeek);
  const [title, setTitle] = useState(WEEKLY_DEFAULT_TITLE);
  const [subtitle, setSubtitle] = useState("");
  const [intro, setIntro] = useState("");
  const [duplicateFrom, setDuplicateFrom] = useState("");
  const [useTemplate, setUseTemplate] = useState(true);

  const weekStart = week ? weekStartFor(week) : "";
  const taken = editions.some(
    (e) => e.scopeId === scopeId && e.weekStart === weekStart,
  );

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createWeeklyEdition({
        scopeId,
        weekStart,
        title,
        subtitle: subtitle || null,
        intro: intro || null,
        duplicateFrom: duplicateFrom || null,
        useTemplate,
      });
      if (res.status === 200 && "data" in res && res.data) {
        router.push(`/weekly/${res.data.id}`);
        return;
      }
      setError(res.message ?? "Couldn't create the edition.");
    });

  return (
    <Card className="max-w-2xl space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Area</span>
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className={cn(input, "mt-1")}
          >
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isNational ? " (whole country)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="block text-sm">
          <label htmlFor="weekly-week" className="font-medium">
            Week
          </label>
          <input
            id="weekly-week"
            type="date"
            value={week}
            aria-describedby="weekly-week-hint"
            onChange={(e) => setWeek(e.target.value)}
            className={cn(input, "mt-1")}
          />
          <span
            id="weekly-week-hint"
            className="mt-1 block text-xs text-muted-foreground"
          >
            {weekStart
              ? `Monday to Sunday: ${formatWeekRange(weekStart)}`
              : "Pick any day; the edition covers its Monday to Sunday."}
          </span>
          {taken ? (
            <span role="alert" className="mt-1 block text-xs text-destructive">
              This area already has an edition for that week.
            </span>
          ) : null}
        </div>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Title</span>
        <input
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          className={cn(input, "mt-1")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Subtitle (optional)</span>
        <input
          value={subtitle}
          maxLength={160}
          onChange={(e) => setSubtitle(e.target.value)}
          className={cn(input, "mt-1")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Introduction (optional)</span>
        <textarea
          value={intro}
          maxLength={600}
          rows={3}
          onChange={(e) => setIntro(e.target.value)}
          className={cn(input, "mt-1")}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Plain text. Leave a blank line between paragraphs.
        </span>
      </label>

      <fieldset className="space-y-2 rounded border border-border p-3 text-sm">
        <legend className="px-1 font-medium">Start from</legend>
        <label className="block">
          <span className="block text-xs text-muted-foreground">
            Copy the sections and listings of an earlier edition
          </span>
          <select
            value={duplicateFrom}
            onChange={(e) => setDuplicateFrom(e.target.value)}
            className={cn(input, "mt-1")}
          >
            <option value="">Nothing to copy</option>
            {editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.scopeName} · {formatWeekRange(e.weekStart)} · {e.title}
              </option>
            ))}
          </select>
        </label>
        {!duplicateFrom ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useTemplate}
              onChange={(e) => setUseTemplate(e.target.checked)}
            />
            Add the default sections (note, weekend, new, free, places)
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pins are not copied. Listings that can no longer be shown are
            flagged in the editor.
          </p>
        )}
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        onClick={submit}
        disabled={pending || !scopeId || !weekStart || !title.trim() || taken}
      >
        {pending ? "Creating…" : "Create edition"}
      </Button>
    </Card>
  );
}
