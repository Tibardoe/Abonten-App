"use client";

import { Badge, Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import {
  addShowcaseEntry,
  searchShowcaseCandidates,
} from "@/server/actions/showcase";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type {
  ShowcaseCandidate,
  ShowcaseCityOption,
} from "@abonten/types/showcaseType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SHOWCASE_REASON_LABEL } from "./reasons";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

// Find a host (organizer: a person or a team) or a place by name, @handle,
// a profile or place link, or an id, and put it on this market's wall.
// Each result says whether it would show right now and, if not, why; it can
// still be added (it shows once it qualifies).
export function ShowcaseAddPanel({
  countryCode,
  cities,
}: {
  countryCode: string;
  cities: ShowcaseCityOption[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"any" | "host" | "place">("any");
  const [regionId, setRegionId] = useState("");
  const [note, setNote] = useState("");
  const [results, setResults] = useState<ShowcaseCandidate[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  const search = () =>
    startSearch(async () => {
      setMsg(null);
      const res = await searchShowcaseCandidates({
        countryCode,
        q: q.trim(),
        kind,
      }).catch(actionUnreachable);
      if (res.status !== 200 || !("data" in res) || !res.data) {
        setResults(null);
        setMsg({ ok: false, text: res.message ?? "Couldn't search." });
        return;
      }
      setResults(res.data);
    });

  const add = (candidate: ShowcaseCandidate) =>
    startAdd(async () => {
      setMsg(null);
      const res = await addShowcaseEntry({
        countryCode,
        subjectKind: candidate.subjectKind,
        subjectId: candidate.subjectId,
        regionId: regionId || null,
        note: note.trim() || null,
      }).catch(actionUnreachable);
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Added." : "Couldn't add."),
      });
      if (res.status === 200) {
        setResults(null);
        setQ("");
        setNote("");
        router.refresh();
      }
    });

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold">Add to this market's wall</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) search();
        }}
      >
        <label className="min-w-[16rem] flex-1 text-sm">
          <span className="font-medium">Name, @handle, link or id</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. @djsmith, Bella Lounge, abontenhub.com/places/…"
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">Looking for</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={cn(input, "mt-1 w-36")}
          >
            <option value="any">Hosts and places</option>
            <option value="host">Hosts</option>
            <option value="place">Places</option>
          </select>
        </label>
        <Button
          type="submit"
          size="sm"
          disabled={searching || q.trim().length < 2}
        >
          Search
        </Button>
      </form>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">City (optional)</span>
          <span className="block text-xs text-muted-foreground">
            Only for people browsing that city. Empty: the whole market.
          </span>
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            className={cn(input, "mt-1")}
          >
            <option value="">The whole market</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.launchStatus !== "launched" ? " (coming soon)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">Staff note (optional)</span>
          <span className="block text-xs text-muted-foreground">
            Only staff see it. Why they are on the wall, who asked, until when.
          </span>
          <input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
      </div>

      {msg ? (
        <p
          className={cn(
            "text-sm",
            msg.ok ? "text-success" : "text-destructive",
          )}
          aria-live="polite"
        >
          {msg.text}
        </p>
      ) : null}

      {results ? (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing found. Try their @handle or paste their page's link.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border">
            {results.map((r) => (
              <li
                key={`${r.subjectKind}:${r.subjectId}`}
                className="flex items-center gap-3 p-2 text-sm"
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
                    className={cn(
                      "h-10 w-10 shrink-0 object-cover",
                      r.subjectKind === "host" ? "rounded-full" : "rounded",
                    )}
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {r.name}{" "}
                    <Badge>{r.subjectKind === "host" ? "Host" : "Place"}</Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.username ? `@${r.username}` : r.slug}
                    {r.countryCode && r.countryCode !== countryCode
                      ? ` · in ${r.countryCode}`
                      : ""}
                  </p>
                  {r.reason ? (
                    <Badge tone="warning">
                      Would not show: {SHOWCASE_REASON_LABEL[r.reason]}
                    </Badge>
                  ) : (
                    <Badge tone="success">Would show</Badge>
                  )}
                </div>
                {r.entryId ? (
                  <Badge tone="info">On the wall</Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={adding || r.reason === "other_market"}
                    onClick={() => add(r)}
                  >
                    Add
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Card>
  );
}
