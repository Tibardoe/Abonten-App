"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { Badge, Button, Card, EmptyState, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { formatOpsDate, formatOpsDateTime } from "@/lib/format";
import {
  moveShowcaseEntry,
  removeShowcaseEntry,
  updateShowcaseEntry,
} from "@/server/actions/showcase";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type {
  ShowcaseAdminEntry,
  ShowcaseCityOption,
} from "@abonten/types/showcaseType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SHOWCASE_REASON_LABEL } from "./reasons";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

// The market's wall in its order: what each entry is, whether it shows now
// and why not, its next event, its city and note, and the taps and follows
// it brought. Up / Down change the order; Remove takes it off (its counts go
// with it).
export function ShowcaseEntryList({
  entries,
  cities,
  canEdit,
}: {
  entries: ShowcaseAdminEntry[];
  cities: ShowcaseCityOption[];
  canEdit: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState>
        Nobody is on this market's wall yet. Add hosts and places above.
      </EmptyState>
    );
  }
  return (
    <Card className="divide-y divide-border">
      {entries.map((entry, index) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          cities={cities}
          canEdit={canEdit}
          first={index === 0}
          last={index === entries.length - 1}
        />
      ))}
    </Card>
  );
}

function EntryRow({
  entry,
  cities,
  canEdit,
  first,
  last,
}: {
  entry: ShowcaseAdminEntry;
  cities: ShowcaseCityOption[];
  canEdit: boolean;
  first: boolean;
  last: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [regionId, setRegionId] = useState(entry.regionId ?? "");
  const [note, setNote] = useState(entry.note ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const run = (call: () => Promise<{ status: number; message?: string }>) =>
    start(async () => {
      setMsg(null);
      const res = await call();
      if (res.status === 200) {
        setEditing(false);
        router.refresh();
      } else {
        setMsg(res.message ?? "Couldn't save.");
      }
    });

  const link =
    entry.subjectKind === "host"
      ? `/organizers/${entry.subjectId}`
      : `/places/${entry.subjectId}`;

  return (
    <div className="flex flex-wrap items-start gap-3 p-3 text-sm">
      <span className="w-6 pt-2 text-right text-xs tabular-nums text-muted-foreground">
        {entry.position}
      </span>
      {entry.imagePublicId ? (
        <img
          src={buildCloudinaryUrl(entry.imagePublicId, entry.imageVersion, {
            width: 48,
            height: 48,
          })}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          className={cn(
            "h-12 w-12 shrink-0 object-cover",
            entry.subjectKind === "host" ? "rounded-full" : "rounded",
          )}
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <a href={link} className="font-medium hover:underline">
            {entry.name || "(no name)"}
          </a>
          <Badge>{entry.subjectKind === "host" ? "Host" : "Place"}</Badge>
          {entry.isTeam ? <Badge>Team</Badge> : null}
          {entry.verified ? <Badge tone="info">Verified</Badge> : null}
          {entry.reason ? (
            <Badge tone="warning">
              Hidden: {SHOWCASE_REASON_LABEL[entry.reason]}
            </Badge>
          ) : (
            <Badge tone="success">Showing</Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {entry.username ? `@${entry.username} · ` : ""}
          {entry.regionName ? `Only in ${entry.regionName}` : "Whole market"}
          {entry.nextEvent
            ? ` · Next: ${entry.nextEvent.title} (${formatOpsDateTime(entry.nextEvent.startsAt)} UTC)`
            : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Taps {entry.counts.taps7} · follows {entry.counts.follows7} (7 days) ·
          taps {entry.counts.taps30} · follows {entry.counts.follows30} (30
          days) · added {formatOpsDate(entry.createdAt)}
        </p>
        {entry.note && !editing ? (
          <p className="text-xs">Note: {entry.note}</p>
        ) : null}

        {editing ? (
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <label className="text-xs">
              <span className="font-medium">City</span>
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className={cn(input, "mt-1")}
              >
                <option value="">The whole market</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="font-medium">Staff note</span>
              <input
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                className={cn(input, "mt-1")}
              />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    updateShowcaseEntry({
                      entryId: entry.id,
                      regionId: regionId || null,
                      note: note.trim() || null,
                    }).catch(actionUnreachable),
                  )
                }
              >
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setRegionId(entry.regionId ?? "");
                  setNote(entry.note ?? "");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {msg ? (
          <p className="text-xs text-destructive" aria-live="polite">
            {msg}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || first}
            aria-label={`Move ${entry.name} up`}
            onClick={() =>
              run(() =>
                moveShowcaseEntry({ entryId: entry.id, direction: "up" }).catch(
                  actionUnreachable,
                ),
              )
            }
          >
            Up
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || last}
            aria-label={`Move ${entry.name} down`}
            onClick={() =>
              run(() =>
                moveShowcaseEntry({
                  entryId: entry.id,
                  direction: "down",
                }).catch(actionUnreachable),
              )
            }
          >
            Down
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setEditing((e) => !e)}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={async () => {
              if (
                !(await confirm(
                  `Take ${entry.name || "this entry"} off the wall? Its tap and follow counts go with it.`,
                  { confirmLabel: "Remove", danger: true },
                ))
              ) {
                return;
              }
              run(() =>
                removeShowcaseEntry({ entryId: entry.id }).catch(
                  actionUnreachable,
                ),
              );
            }}
          >
            Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}
