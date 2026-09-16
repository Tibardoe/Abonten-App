"use client";

import { listOwnCampaigns } from "@/actions/content/listOwnCampaigns";
import { listOwnContent } from "@/actions/content/listOwnContent";
import { publishContentPost } from "@/actions/content/publishContentPost";
import { cn } from "@/components/lib/utils";
import { useToast } from "@/hooks/useToast";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { countLabel } from "@abonten/core/content/copy";
import { spotlightPath } from "@abonten/core/content/links";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type { ContentKind, ContentOwnPost } from "@abonten/types/contentType";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { IoAdd, IoPlay } from "react-icons/io5";
import { useContentProgram } from "../hooks/useContentProgram";
import { dataOf, messageOf } from "../lib/result";
import {
  CampaignStatusPill,
  StatusPill,
  postStatusLabel,
} from "../molecules/ContentStatusBadge";
import ContentComposer from "./ContentComposer";

type Tab = "spotlight" | "story" | "campaigns";

export default function CreatorHub() {
  const { program, ready } = useContentProgram();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const newParam = searchParams.get("new");
  const tabParam = searchParams.get("tab");
  const tab: Tab =
    tabParam === "story" || tabParam === "campaigns" ? tabParam : "spotlight";
  const composerKind: ContentKind | null =
    newParam === "story"
      ? "story"
      : newParam === "spotlight"
        ? "spotlight"
        : null;

  const setParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  if (!ready) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canPost =
    program.canPublish && (program.spotlightPosting || program.storiesPosting);

  if (!canPost) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-bold">Spotlight & Stories</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Posting is open to organizers and place owners as we roll it out.
          Create an event or list a place to get started.
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "spotlight", label: "Spotlights", show: program.spotlightPosting },
    { key: "story", label: "Stories", show: program.storiesPosting },
    {
      key: "campaigns",
      label: "Promotions",
      show: program.spotlightPromotions,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Spotlight & Stories</h1>
          <p className="text-sm text-muted-foreground">
            Share short videos and Stories about your events and places.
          </p>
        </div>
        <div className="flex gap-2">
          {program.storiesPosting ? (
            <button
              type="button"
              onClick={() => setParams({ new: "story" })}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-accent"
            >
              <IoAdd /> New Story
            </button>
          ) : null}
          {program.spotlightPosting ? (
            <button
              type="button"
              onClick={() => setParams({ new: "spotlight" })}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <IoAdd /> New Spotlight
            </button>
          ) : null}
        </div>
      </div>

      <div role="tablist" className="flex gap-2 border-b">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() =>
                setParams({ tab: t.key === "spotlight" ? null : t.key })
              }
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-semibold",
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "campaigns" ? <OwnCampaigns /> : <OwnPosts kind={tab} />}

      {composerKind ? (
        <ContentComposer
          initialKind={composerKind}
          onClose={() => setParams({ new: null })}
        />
      ) : null}
    </div>
  );
}

function OwnPosts({ kind }: { kind: ContentKind }) {
  const query = useInfiniteQuery({
    queryKey: ["content", "own", kind],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await listOwnContent({
        kind,
        cursor: pageParam ?? undefined,
      });
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });

  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Couldn't load your posts.{" "}
        <button
          type="button"
          onClick={() => query.refetch()}
          className="font-semibold text-primary hover:underline"
        >
          Retry
        </button>
      </p>
    );
  }
  if (posts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {kind === "story"
          ? "You haven't posted a Story yet."
          : "You haven't posted a Spotlight yet."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {posts.map((post) => (
          <OwnPostRow key={post.id} post={post} />
        ))}
      </ul>
      {query.hasNextPage ? (
        <button
          type="button"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="w-full py-2 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {query.isFetchingNextPage ? "Loading…" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function OwnPostRow({ post }: { post: ContentOwnPost }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const status = postStatusLabel(post);
  const cover = post.cover;
  const src =
    cover?.type === "video"
      ? cover.thumbnailUrl
      : (cover?.thumbnailUrl ?? cover?.mediaUrl);

  const publish = async () => {
    setPublishing(true);
    const res = await publishContentPost({ postId: post.id });
    setPublishing(false);
    if (res.status !== 200) {
      toast.error(messageOf(res, "Couldn't publish this post."));
      return;
    }
    toast.success("Published.");
    qc.invalidateQueries({ queryKey: ["content", "own"] });
  };

  return (
    <li className="flex items-center gap-3 p-3">
      <div className="relative h-20 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {src ? (
          <Image src={src} alt="" fill sizes="48px" className="object-cover" />
        ) : null}
        {cover?.type === "video" ? (
          <IoPlay className="absolute bottom-1 left-1 text-xs text-white drop-shadow" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <StatusPill label={status.label} tone={status.tone} />
          {post.campaign ? (
            <CampaignStatusPill status={post.campaign.status} />
          ) : null}
          <span className="text-xs text-muted-foreground">
            {formatStoryAge(post.publishedAt ?? post.createdAt)}
          </span>
        </div>
        <p className="line-clamp-1 text-sm">
          {post.caption?.trim() || (
            <span className="text-muted-foreground">No caption</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {countLabel(post.counts.views, "view")} ·{" "}
          {countLabel(post.counts.likes, "like")} ·{" "}
          {countLabel(post.counts.comments, "comment")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
        {post.status === "draft" ? (
          <button
            type="button"
            onClick={publish}
            disabled={publishing}
            className="font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        ) : null}
        <Link
          href={`/manage/spotlight/posts/${post.id}`}
          className="font-semibold text-primary hover:underline"
        >
          Manage
        </Link>
        {post.kind === "spotlight" && status.label === "Live" ? (
          <Link
            href={spotlightPath(post.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            View
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function OwnCampaigns() {
  const query = useQuery({
    queryKey: ["content", "campaigns"],
    queryFn: async () => {
      const res = await listOwnCampaigns();
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Couldn't load your promotions.
      </p>
    );
  }
  if (query.data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No promotions yet. Open a live Spotlight and choose Promote.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {query.data.map((c) => (
        <li key={c.id}>
          <Link
            href={`/manage/spotlight/campaigns/${c.id}`}
            className="flex items-center gap-3 p-3 hover:bg-accent/50"
          >
            <div className="relative h-16 w-10 shrink-0 overflow-hidden rounded bg-muted">
              {c.post?.thumbnailUrl ? (
                <Image
                  src={c.post.thumbnailUrl}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <CampaignStatusPill status={c.status} />
                <span className="text-xs text-muted-foreground">
                  {c.durationDays} days
                </span>
              </div>
              <p className="line-clamp-1 text-sm">
                {c.post?.caption?.trim() || "Spotlight"}
              </p>
              <p className="text-xs text-muted-foreground">
                {countLabel(c.reach, "person", "people")} reached ·{" "}
                {countLabel(c.impressions, "impression")} ·{" "}
                {countLabel(c.clicks, "click")}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold">
              {formatMinor(c.budgetMinor, c.currency)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
