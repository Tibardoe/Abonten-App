"use client";

import { Badge, Button, Card, cn, timeAgo } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { setSocialPostStatus } from "@/server/actions/social";
import type {
  SocialQueueImage,
  SocialQueueItem,
  SocialQueueSubject,
} from "@abonten/types/socialQueueType";
import { Download, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyButton } from "./CopyButton";
import {
  SOCIAL_CHANNEL_HINT,
  SOCIAL_CHANNEL_LABEL,
  captionLabel,
} from "./channelLabels";

const KIND_LABEL: Record<SocialQueueSubject["kind"], string> = {
  event: "Event",
  place: "Place",
  roundup: "Roundup",
};

const STATUS: Record<
  SocialQueueItem["status"],
  { label: string; tone: "info" | "success" | "neutral" }
> = {
  pending: { label: "To post", tone: "info" },
  posted: { label: "Posted", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
};

/** The console's own address for one share image (see social/image). */
function imageSrc(image: SocialQueueImage, download = false): string {
  const q = new URLSearchParams({
    kind: image.kind,
    key: image.key,
    format: image.format,
  });
  if (download) q.set("download", "1");
  return `/social/image?${q.toString()}`;
}

function Images({ images }: { images: SocialQueueImage[] }) {
  if (images.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {images.map((image) => (
        <figure
          key={`${image.kind}/${image.key}/${image.format}`}
          className="w-32 shrink-0 space-y-1"
        >
          <a
            href={imageSrc(image)}
            target="_blank"
            rel="noreferrer"
            title="Open the full-size picture"
          >
            <img
              src={imageSrc(image)}
              alt={image.label}
              width={128}
              height={image.format === "story" ? 228 : 160}
              loading="lazy"
              className={cn(
                "w-32 rounded border border-border bg-muted object-cover",
                image.format === "story" ? "h-[228px]" : "h-40",
              )}
            />
          </a>
          <figcaption className="truncate text-xs text-muted-foreground">
            {image.label}
          </figcaption>
          <a
            href={imageSrc(image, true)}
            download={image.fileName}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Download className="h-3 w-3" aria-hidden />
            Download
          </a>
        </figure>
      ))}
    </div>
  );
}

function ChannelItem({
  item,
  canManage,
}: {
  item: SocialQueueItem;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const change = (status: SocialQueueItem["status"]) =>
    start(async () => {
      setMsg(null);
      const res = await setSocialPostStatus({
        id: item.id,
        status,
        note: status === "pending" ? null : note.trim() || null,
      }).catch(actionUnreachable);
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setNote("");
        router.refresh();
      }
    });

  const status = STATUS[item.status];
  const gone = !item.link;

  return (
    <div className="space-y-3 border-t border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">
          {SOCIAL_CHANNEL_LABEL[item.channel]}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
        {item.xLength !== null ? (
          <span
            className={cn(
              "text-xs",
              item.xLength > 280 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {item.xLength}/280 on X
          </span>
        ) : null}
        {item.status !== "pending" && item.decidedBy ? (
          <span className="text-xs text-muted-foreground">
            by {item.decidedBy.label}, {timeAgo(item.decidedAt)}
          </span>
        ) : null}
      </div>

      {gone ? (
        <p className="text-sm text-muted-foreground">
          The listing is gone, so there is nothing to post. Skip it.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {SOCIAL_CHANNEL_HINT[item.channel]}
          </p>
          <Images images={item.images} />

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">
                {captionLabel(item.channel)}
              </span>
              <CopyButton text={item.caption} />
            </div>
            <textarea
              readOnly
              value={item.caption}
              rows={Math.min(14, item.caption.split("\n").length + 1)}
              className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
              aria-label={`${captionLabel(item.channel)} for ${SOCIAL_CHANNEL_LABEL[item.channel]}`}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Link</span>
              <CopyButton text={item.link} label="Copy link" />
            </div>
            <input
              readOnly
              value={item.link}
              className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
              aria-label={`Link for ${SOCIAL_CHANNEL_LABEL[item.channel]}`}
            />
          </div>
        </>
      )}

      {item.note ? (
        <p className="text-xs text-muted-foreground">Note: {item.note}</p>
      ) : null}

      {canManage ? (
        item.status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Note (optional)"
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
              aria-label="Note"
            />
            <Button
              type="button"
              size="sm"
              disabled={pending || gone}
              onClick={() => change("posted")}
            >
              Mark posted
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => change("skipped")}
            >
              Skip
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => change("pending")}
          >
            Put back in the queue
          </Button>
        )
      ) : null}

      {msg ? (
        <p
          className={cn(
            "text-xs",
            msg.ok ? "text-success" : "text-destructive",
          )}
          aria-live="polite"
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

export function SocialSubjectCard({
  subject,
  canManage,
}: {
  subject: SocialQueueSubject;
  canManage: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="space-y-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{KIND_LABEL[subject.kind]}</Badge>
          <h3 className="text-base font-semibold">{subject.title}</h3>
        </div>
        {subject.subtitle ? (
          <p className="text-sm text-muted-foreground">{subject.subtitle}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-xs">
          {subject.publicUrl ? (
            <a
              href={subject.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Public page
            </a>
          ) : null}
          {subject.adminHref ? (
            <a
              href={subject.adminHref}
              className="text-primary hover:underline"
            >
              In the console
            </a>
          ) : null}
        </div>
        {subject.warning ? (
          <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-sm text-warning">
            {subject.warning} Check before posting.
          </p>
        ) : null}
      </div>
      {subject.items.map((item) => (
        <ChannelItem key={item.id} item={item} canManage={canManage} />
      ))}
    </Card>
  );
}
