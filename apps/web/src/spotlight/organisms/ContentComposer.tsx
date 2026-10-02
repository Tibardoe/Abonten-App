"use client";

import { createContentPost } from "@/actions/content/createContentPost";
import { listAttachableEvents } from "@/actions/content/listAttachableEvents";
import { cn } from "@/components/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/useToast";
import { CONTENT_RIGHTS_ACKNOWLEDGEMENT_KEY } from "@abonten/core/content/copy";
import {
  MAX_CAPTION_LENGTH,
  MAX_CONTENT_IMAGE_BYTES,
  MAX_CONTENT_VIDEO_BYTES,
  MIN_VIDEO_SECONDS,
} from "@abonten/core/content/limits";
import type { ContentKind } from "@abonten/types/contentType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { IoAdd, IoClose } from "react-icons/io5";
import { useContentProgram } from "../hooks/useContentProgram";
import { type ComposerFile, useContentUpload } from "../hooks/useContentUpload";
import { dataOf, messageOf } from "../lib/result";

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Create a Spotlight (one photo or video) or a Story (up to the programme's
 * item limit). Uploads go straight to Cloudinary; the post is created and
 * published in one call once every file is registered. The same rules are
 * enforced again on the server and in content_post_publish().
 */
export default function ContentComposer({
  initialKind,
  onClose,
}: {
  initialKind: ContentKind;
  onClose: () => void;
}) {
  const t = useTranslations("spotlight");
  const tc = useTranslations("core");

  const { program } = useContentProgram();
  const toast = useToast();
  const qc = useQueryClient();
  const kinds: ContentKind[] = [
    ...(program.spotlightPosting ? (["spotlight"] as const) : []),
    ...(program.storiesPosting ? (["story"] as const) : []),
  ];
  const [kind, setKind] = useState<ContentKind>(
    kinds.includes(initialKind) ? initialKind : (kinds[0] ?? "spotlight"),
  );
  const upload = useContentUpload(kind);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [publisher, setPublisher] = useState<string>("me");
  const [caption, setCaption] = useState("");
  const [eventId, setEventId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [rights, setRights] = useState(false);
  const [submitting, setSubmitting] = useState<"publish" | "draft" | null>(
    null,
  );
  const clientRequestId = useMemo(() => crypto.randomUUID(), []);

  const events = useQuery({
    queryKey: ["content", "attachable-events"],
    queryFn: async () => dataOf(await listAttachableEvents()) ?? [],
    staleTime: 5 * 60_000,
  });

  const maxItems = kind === "story" ? program.maxStoryItems : 1;
  const maxSeconds =
    kind === "story"
      ? program.storyVideoMaxSeconds
      : program.spotlightVideoMaxSeconds;

  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = maxItems - upload.files.length;
    const chosen = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) {
      toast.error(
        kind === "story"
          ? t("aStoryHoldsAtMostItems", { maxItems: maxItems })
          : t("aSpotlightHoldsOnePhotoOr"),
      );
    }
    const accepted = chosen.filter((file) => {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) {
        toast.error(t("isnTAPhotoOrVideo", { name: file.name }));
        return false;
      }
      if (
        file.size >
        (isVideo ? MAX_CONTENT_VIDEO_BYTES : MAX_CONTENT_IMAGE_BYTES)
      ) {
        toast.error(t("isTooLarge", { name: file.name }));
        return false;
      }
      return true;
    });
    const added = await upload.add(accepted);
    for (const f of added) {
      if (f.type !== "video" || f.durationSeconds === null) continue;
      if (f.durationSeconds < MIN_VIDEO_SECONDS) {
        toast.error(t("thatVideoIsTooShort"));
        upload.remove(f.id);
      } else if (f.durationSeconds > maxSeconds) {
        // Start with the first allowed stretch selected; the creator can move it.
        upload.patch(f.id, { trimStart: 0, trimEnd: maxSeconds });
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const tooLong = upload.files.some(
    (f) =>
      f.type === "video" &&
      f.durationSeconds !== null &&
      (f.trimEnd ?? f.durationSeconds) - f.trimStart > maxSeconds + 0.5,
  );
  const busy = submitting !== null;
  const canSubmit = upload.files.length > 0 && rights && !tooLong && !busy;

  const submit = async (publish: boolean) => {
    if (!canSubmit) return;
    setSubmitting(publish ? "publish" : "draft");
    try {
      const media = await upload.uploadAll(upload.files);
      if (!media) {
        toast.error(t("someFilesDidnTUploadFix"));
        return;
      }
      const place = program.publisherPlaces.find((p) => p.id === publisher);
      const res = await createContentPost({
        kind,
        publisher: place
          ? { kind: "place", placeId: place.id }
          : { kind: "organizer", placeId: null },
        mediaIds: media.map((m) => m.id),
        caption: caption.trim() || null,
        hashtags: [],
        eventId: eventId || null,
        placeId: placeId || null,
        allowComments,
        allowDownload: kind === "spotlight" ? allowDownload : false,
        rightsAcknowledged: true,
        publish,
        clientRequestId,
      });
      if (res.status !== 200) {
        toast.error(messageOf(res, t("couldnTCreateYourPost")));
        return;
      }
      toast.success(
        publish
          ? kind === "story"
            ? t("yourStoryIsLive")
            : t("yourSpotlightIsLive")
          : t("savedAsADraft"),
      );
      qc.invalidateQueries({ queryKey: ["content"] });
      upload.reset();
      onClose();
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          upload.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogTitle>
          {kind === "story" ? t("newStory") : t("newSpotlight")}
        </DialogTitle>
        <DialogDescription>
          {kind === "story"
            ? t("storiesDisappearAfterHours", {
                storyTtlHours: program.storyTtlHours,
              })
            : t("aShortVideoOrPhotoAbout")}
        </DialogDescription>

        <div className="space-y-4">
          {kinds.length > 1 ? (
            <div className="flex gap-2">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  disabled={busy || upload.files.length > 0}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60",
                    kind === k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {k === "story" ? t("story") : t("spotlight")}
                </button>
              ))}
            </div>
          ) : null}

          {program.publisherPlaces.length > 0 ? (
            <div className="block space-y-1 text-sm font-medium">
              <label htmlFor="composer-field-1">{t("postAs")}</label>
              <Select
                id="composer-field-1"
                value={publisher}
                disabled={busy}
                onChange={(e) => setPublisher(e.target.value)}
              >
                <option value="me">{t("meOrganizerProfile")}</option>
                {program.publisherPlaces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {/* Media */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {upload.files.map((f) => (
                <MediaTile
                  key={f.id}
                  item={f}
                  disabled={busy}
                  onRemove={() => upload.remove(f.id)}
                />
              ))}
              {upload.files.length < maxItems ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-[9/16] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:bg-accent disabled:opacity-60"
                >
                  <IoAdd className="text-2xl" />
                  {upload.files.length === 0
                    ? t("addPhotoOrVideo")
                    : t("addMore")}
                </button>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="image/*,video/*"
              multiple={kind === "story"}
              onChange={(e) => pick(e.target.files)}
            />
            <p className="text-xs text-muted-foreground">
              {t("videosUpToSeconds", { maxSeconds: maxSeconds })}
              {kind === "story" ? ` ${t("upToItems", { maxItems })}` : ""}
            </p>
            {upload.files
              .filter(
                (f) =>
                  f.type === "video" &&
                  f.durationSeconds !== null &&
                  f.durationSeconds > maxSeconds,
              )
              .map((f) => (
                <TrimControl
                  key={f.id}
                  item={f}
                  maxSeconds={maxSeconds}
                  disabled={busy}
                  onChange={(start, end) =>
                    upload.patch(f.id, { trimStart: start, trimEnd: end })
                  }
                />
              ))}
          </div>

          <label className="block space-y-1 text-sm font-medium">
            <span>{t("caption")}</span>
            <textarea
              value={caption}
              maxLength={MAX_CAPTION_LENGTH}
              disabled={busy}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder={t("saySomethingHashtagsHelpPeopleFind")}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>

          {(events.data?.length ?? 0) > 0 ? (
            <div className="block space-y-1 text-sm font-medium">
              <label htmlFor="composer-field-2">
                {t("linkAnEventOptional")}
              </label>
              <Select
                id="composer-field-2"
                value={eventId}
                disabled={busy}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="">{t("noEvent")}</option>
                {events.data?.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {program.publisherPlaces.length > 0 ? (
            <div className="block space-y-1 text-sm font-medium">
              <label htmlFor="composer-field-3">
                {t("linkAPlaceOptional")}
              </label>
              <Select
                id="composer-field-3"
                value={placeId}
                disabled={busy}
                onChange={(e) => setPlaceId(e.target.value)}
              >
                <option value="">{t("noPlace")}</option>
                {program.publisherPlaces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowComments}
                disabled={busy}
                onChange={(e) => setAllowComments(e.target.checked)}
              />
              {t("allowComments")}
            </label>
            {kind === "spotlight" && program.spotlightDownloads ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  disabled={busy}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                />
                {t("letPeopleDownloadThisVideo")}
              </label>
            ) : null}
            <label className="flex items-start gap-2 rounded-md bg-muted p-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={rights}
                disabled={busy}
                onChange={(e) => setRights(e.target.checked)}
              />
              <span>{tc(CONTENT_RIGHTS_ACKNOWLEDGEMENT_KEY)}</span>
            </label>
          </div>

          {tooLong ? (
            <p className="text-sm text-destructive">
              {t("trimYourVideoToSecondsOr", { maxSeconds: maxSeconds })}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => submit(false)}
              className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              {submitting === "draft" ? t("saving") : t("saveDraft")}
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => submit(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting === "publish" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {submitting === "publish" ? t("publishing") : t("publish")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaTile({
  item,
  disabled,
  onRemove,
}: {
  item: ComposerFile;
  disabled: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations("spotlight");

  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted">
      {item.type === "video" ? (
        <video
          src={item.previewUrl}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        <Image
          src={item.previewUrl}
          alt=""
          fill
          unoptimized
          className="object-cover"
        />
      )}
      {!disabled ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("remove")}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
        >
          <IoClose />
        </button>
      ) : null}
      {item.type === "video" && item.durationSeconds !== null ? (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[11px] text-white">
          {formatSeconds(item.durationSeconds)}
        </span>
      ) : null}
      {item.status === "uploading" || item.status === "registering" ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      ) : null}
      {item.status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-2 text-center text-xs text-white">
          {item.error}
        </div>
      ) : null}
    </div>
  );
}

function TrimControl({
  item,
  maxSeconds,
  disabled,
  onChange,
}: {
  item: ComposerFile;
  maxSeconds: number;
  disabled: boolean;
  onChange: (start: number, end: number) => void;
}) {
  const t = useTranslations("spotlight");

  const duration = item.durationSeconds ?? 0;
  const start = item.trimStart;
  const end = item.trimEnd ?? duration;
  return (
    <div className="space-y-1 rounded-md border p-2 text-sm">
      <p className="font-medium">
        {t("chooseUpToSeconds", {
          maxSeconds: maxSeconds,
          formatSeconds: formatSeconds(start),
          formatSeconds2: formatSeconds(end),
        })}
      </p>
      <Slider
        min={0}
        max={duration}
        step={0.5}
        value={[start, end]}
        disabled={disabled}
        onValueChange={([s, e]) => {
          let nextStart = s;
          let nextEnd = e;
          if (nextEnd - nextStart > maxSeconds) {
            if (nextStart !== start) nextEnd = nextStart + maxSeconds;
            else nextStart = nextEnd - maxSeconds;
          }
          onChange(Math.max(0, nextStart), Math.min(duration, nextEnd));
        }}
        aria-label={t("trimVideo")}
      />
    </div>
  );
}
