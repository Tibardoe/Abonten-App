"use client";

import { deleteContentPost } from "@/actions/content/deleteContentPost";
import { getContentInsights } from "@/actions/content/getContentInsights";
import { getContentPost } from "@/actions/content/getContentPost";
import { updateContentPost } from "@/actions/content/updateContentPost";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useToast } from "@/hooks/useToast";
import { MAX_CAPTION_LENGTH } from "@abonten/core/content/limits";
import { spotlightPath, storyPath } from "@abonten/core/content/links";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useContentProgram } from "../hooks/useContentProgram";
import { dataOf, messageOf } from "../lib/result";
import CampaignCreateDialog from "./CampaignCreateDialog";

const RANGES = [7, 28, 90] as const;

export default function ManagePost({ postId }: { postId: string }) {
  const { program } = useContentProgram();
  const query = useQuery({
    queryKey: ["content", "manage-post", postId],
    queryFn: () => getContentPost({ postId }),
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const res = query.data;
  const post = res && res.status === 200 ? res.data.post : null;
  if (!post || !post.viewer.isAuthor) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-muted-foreground">
          This post isn't available.
        </p>
        <Link
          href="/manage/spotlight"
          className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
        >
          Back to Spotlight & Stories
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link
        href={`/manage/spotlight${post.kind === "story" ? "?tab=story" : ""}`}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Spotlight & Stories
      </Link>
      <div className="grid gap-6 md:grid-cols-[240px,1fr]">
        <PostPreview post={post} />
        <div className="space-y-6">
          <Insights postId={post.id} />
          <EditPost post={post} canPromote={program.spotlightPromotions} />
        </div>
      </div>
    </div>
  );
}

function PostPreview({ post }: { post: ContentPostDocument }) {
  const media = post.media[0];
  const src =
    media?.type === "video"
      ? (media.posterUrl ?? media.thumbnailUrl)
      : (media?.thumbnailUrl ?? media?.mediaUrl);
  const live =
    post.status === "published" &&
    (post.moderationState === "visible" ||
      post.moderationState === "restricted");
  return (
    <div className="space-y-2">
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-muted">
        {src ? (
          <Image src={src} alt="" fill sizes="240px" className="object-cover" />
        ) : null}
      </div>
      {live ? (
        <Link
          href={
            post.kind === "story" ? storyPath(post.id) : spotlightPath(post.id)
          }
          className="block text-center text-sm font-semibold text-primary hover:underline"
        >
          View as others see it
        </Link>
      ) : null}
      {post.moderationState === "hidden" ||
      post.moderationState === "removed" ? (
        <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          This post was {post.moderationState} by our moderation team and isn't
          shown to anyone else. Check your notifications for the reason.
        </p>
      ) : null}
    </div>
  );
}

function Insights({ postId }: { postId: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(28);
  const query = useQuery({
    queryKey: ["content", "insights", postId, days],
    queryFn: async () => {
      const res = await getContentInsights({ postId, days });
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
  });
  const t = query.data?.totals;

  const tiles: [string, number | undefined][] = [
    ["Impressions", t?.impressions],
    ["Views", t?.meaningfulViews],
    ["Completions", t?.completions],
    ["People reached", t?.uniqueViewers],
    ["Likes", t?.likes],
    ["Comments", t?.comments],
    ["Shares", t?.shares],
    ["Saves", t?.saves],
    ["Profile taps", t?.profileClicks],
    ["Event taps", t?.eventClicks],
    ["Place taps", t?.placeClicks],
    ["Tickets bought", query.data?.conversions.ticketPurchases],
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Insights</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={
                days === r
                  ? "rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"
                  : "rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              }
            >
              {r} days
            </button>
          ))}
        </div>
      </div>
      {query.isError ? (
        <p className="text-sm text-muted-foreground">Couldn't load insights.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold">
                {query.isLoading ? "…" : (value ?? 0).toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        Counts update about once an hour. Views count after two seconds of
        watching.
      </p>
    </section>
  );
}

function EditPost({
  post,
  canPromote,
}: {
  post: ContentPostDocument;
  canPromote: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [caption, setCaption] = useState(post.caption ?? "");
  const [allowComments, setAllowComments] = useState(post.allowComments);
  const [allowDownload, setAllowDownload] = useState(post.allowDownload);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const dirty =
    caption !== (post.caption ?? "") ||
    allowComments !== post.allowComments ||
    allowDownload !== post.allowDownload;

  const save = async () => {
    setSaving(true);
    const res = await updateContentPost({
      postId: post.id,
      patch: {
        caption: caption.trim() || null,
        allowComments,
        ...(post.kind === "spotlight" ? { allowDownload } : {}),
      },
    });
    setSaving(false);
    if (res.status !== 200) {
      toast.error(messageOf(res, "Couldn't save your changes."));
      return;
    }
    toast.success("Saved.");
    qc.invalidateQueries({ queryKey: ["content"] });
  };

  const remove = async () => {
    setDeleting(true);
    const res = await deleteContentPost({ postId: post.id });
    setDeleting(false);
    if (res.status !== 200) {
      toast.error(messageOf(res, "Couldn't delete this post."));
      return;
    }
    toast.success("Deleted.");
    qc.invalidateQueries({ queryKey: ["content"] });
    router.push("/manage/spotlight");
  };

  const promotable =
    canPromote &&
    post.kind === "spotlight" &&
    post.status === "published" &&
    post.moderationState === "visible";

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Details</h2>
      <label className="block space-y-1 text-sm font-medium">
        <span>Caption</span>
        <textarea
          value={caption}
          maxLength={MAX_CAPTION_LENGTH}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowComments}
          onChange={(e) => setAllowComments(e.target.checked)}
        />
        Allow comments
      </label>
      {post.kind === "spotlight" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
          />
          Let people download this video
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {promotable ? (
          <button
            type="button"
            onClick={() => setPromoting(true)}
            className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Promote
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
        >
          Delete
        </button>
      </div>

      {confirmDelete ? (
        <ConfirmDeleteModal
          title="Delete this post?"
          message="It disappears for everyone straight away. This can't be undone. An active promotion is cancelled."
          confirmLabel="Delete"
          loadingLabel="Deleting…"
          isLoading={deleting}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
      {promoting ? (
        <CampaignCreateDialog
          postId={post.id}
          hasEvent={!!post.event}
          hasPlace={!!post.place || post.publisher.kind === "place"}
          onClose={() => setPromoting(false)}
        />
      ) : null}
    </section>
  );
}
