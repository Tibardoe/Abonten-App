"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import {
  createWeeklyEdition,
  getWeeklyPreviewLink,
  transitionWeeklyEdition,
} from "@/server/actions";
import {
  addDays,
  defaultScheduleFor,
  fromAccraInputValue,
  toAccraInputValue,
} from "@abonten/core/weekly/week";
import type {
  WeeklyAdminEditionHeader,
  WeeklyTransitionAction,
  WeeklyValidation,
} from "@abonten/types/weeklyType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatAccraDateTime } from "../format";
import { fieldClass, useEditor } from "./EditorContext";

// Preview, schedule, publish, unpublish, archive, restore, and "copy to next
// week". Scheduling, publishing and unpublishing need weekly.publish and a
// recent identity check; the server checks both again.

export function PublishPanel({
  edition,
  validation,
  stepUpFresh,
  defaultHour,
}: {
  edition: WeeklyAdminEditionHeader;
  validation: WeeklyValidation;
  stepUpFresh: boolean;
  defaultHour: number;
}) {
  const router = useRouter();
  const { editionId, canEdit, canPublish, pending, run } = useEditor();
  const [linkPending, startLink] = useTransition();
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState(() => {
    const suggested = defaultScheduleFor(edition.weekStart, defaultHour);
    return toAccraInputValue(
      new Date(suggested).getTime() > Date.now()
        ? suggested
        : new Date(Date.now() + 15 * 60_000).toISOString(),
    );
  });
  const [preview, setPreview] = useState<{
    url: string;
    expiresAt: string;
  } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const status = edition.status;
  const needsStepUp = canPublish && !stepUpFresh;
  const publishable = canPublish && stepUpFresh;

  const transition = (
    action: WeeklyTransitionAction,
    extra: { scheduledFor?: string; confirm?: string } = {},
  ) => {
    if (extra.confirm && !window.confirm(extra.confirm)) return;
    run(
      (version) =>
        transitionWeeklyEdition({
          editionId,
          expectedVersion: version,
          action,
          scheduledFor: extra.scheduledFor ?? null,
          reason: reason || null,
        }),
      { onSuccess: () => setReason("") },
    );
  };

  const openPreview = () =>
    startLink(async () => {
      setLinkError(null);
      const res = await getWeeklyPreviewLink({ editionId });
      if (res.status === 200 && "data" in res && res.data) {
        setPreview(res.data);
        window.open(res.data.url, "_blank", "noopener,noreferrer");
      } else {
        setLinkError(res.message ?? "Couldn't create a preview link.");
      }
    });

  const copyToNextWeek = () =>
    startLink(async () => {
      setLinkError(null);
      const res = await createWeeklyEdition({
        scopeId: edition.scopeId,
        weekStart: addDays(edition.weekStart, 7),
        title: edition.title,
        subtitle: edition.subtitle,
        intro: edition.intro,
        duplicateFrom: edition.id,
        useTemplate: false,
      });
      if (res.status === 200 && "data" in res && res.data) {
        router.push(`/weekly/${res.data.id}`);
      } else {
        setLinkError(res.message ?? "Couldn't copy the edition.");
      }
    });

  const scheduledFor = fromAccraInputValue(when);

  return (
    <Card className="space-y-3 p-4 text-sm">
      <p className="font-semibold">Publishing</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Scheduled</dt>
        <dd>{formatAccraDateTime(edition.scheduledFor)}</dd>
        <dt className="text-muted-foreground">Published</dt>
        <dd>{formatAccraDateTime(edition.publishedAt)}</dd>
        {edition.unpublishedAt ? (
          <>
            <dt className="text-muted-foreground">Unpublished</dt>
            <dd>{formatAccraDateTime(edition.unpublishedAt)}</dd>
          </>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={openPreview}
          disabled={linkPending}
        >
          Preview
        </Button>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            onClick={copyToNextWeek}
            disabled={linkPending}
          >
            Copy to next week
          </Button>
        ) : null}
      </div>
      {preview ? (
        <p className="break-all text-xs text-muted-foreground">
          Preview link (works until {formatAccraDateTime(preview.expiresAt)}):{" "}
          <a
            href={preview.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            open
          </a>
        </p>
      ) : null}
      {linkError ? (
        <p role="alert" className="text-xs text-destructive">
          {linkError}
        </p>
      ) : null}

      {needsStepUp && status !== "archived" ? (
        <div className="space-y-2 rounded border border-border p-2 text-xs">
          <p>Publishing needs a fresh identity check.</p>
          <StepUpButton next={`/weekly/${editionId}`} />
        </div>
      ) : null}
      {!canPublish && status !== "archived" ? (
        <p className="text-xs text-muted-foreground">
          You can prepare this edition. Publishing needs the “Publish Abonten
          Weekly” permission.
        </p>
      ) : null}

      {publishable && status !== "archived" ? (
        <label className="block text-xs">
          <span className="font-medium">Reason (goes in the audit log)</span>
          <input
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Weekly edition, checked by …"
            className={cn(fieldClass, "mt-1")}
          />
        </label>
      ) : null}

      {publishable && (status === "draft" || status === "scheduled") ? (
        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full"
            disabled={
              pending || !validation.canPublish || reason.trim().length < 5
            }
            onClick={() =>
              transition("publish", {
                confirm:
                  "Publish now? The edition becomes visible to the Abonten Weekly audience straight away.",
              })
            }
          >
            Publish now
          </Button>
          {status === "draft" ? (
            <div className="space-y-1">
              <label className="block text-xs">
                <span className="font-medium">Publish at (Accra time)</span>
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className={cn(fieldClass, "mt-1")}
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={
                  pending ||
                  !validation.canPublish ||
                  !scheduledFor ||
                  reason.trim().length < 5
                }
                onClick={() =>
                  scheduledFor && transition("schedule", { scheduledFor })
                }
              >
                Schedule
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={pending || reason.trim().length < 5}
              onClick={() => transition("unschedule")}
            >
              Cancel schedule
            </Button>
          )}
          {!validation.canPublish ? (
            <p className="text-xs text-destructive">
              Fix the problems below before publishing.
            </p>
          ) : null}
        </div>
      ) : null}

      {publishable && status === "published" ? (
        <Button
          size="sm"
          variant="danger"
          className="w-full"
          disabled={pending || reason.trim().length < 5}
          onClick={() =>
            transition("unpublish", {
              confirm:
                "Unpublish? The edition disappears for everyone and becomes a draft again.",
            })
          }
        >
          Unpublish
        </Button>
      ) : null}

      {canEdit && status !== "archived" ? (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-muted-foreground"
          disabled={pending}
          onClick={() =>
            transition("archive", {
              confirm:
                status === "published"
                  ? "Archive this published edition? It stops being visible."
                  : "Archive this edition?",
            })
          }
        >
          Archive
        </Button>
      ) : null}
      {status === "archived" ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() => transition("restore")}
        >
          Restore as draft
        </Button>
      ) : null}
    </Card>
  );
}
