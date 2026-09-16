"use client";

import { listPublisherContent } from "@/actions/content/listPublisherContent";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { spotlightPath } from "@abonten/core/content/links";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { IoPlay } from "react-icons/io5";
import { useContentProgram } from "../hooks/useContentProgram";
import { dataOf, messageOf } from "../lib/result";

type Page = {
  posts: ContentPostDocument[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

// A publisher's Spotlights as a grid (profile tab, place page). Hidden while
// Spotlight is off for the visitor; `hideWhenEmpty` lets a page section
// disappear instead of showing an empty state.
export default function PublisherSpotlightGrid({
  publisherKind,
  publisherId,
  title,
  hideWhenEmpty = false,
  emptyText = "No Spotlights yet.",
}: {
  publisherKind: "organizer" | "place";
  publisherId: string;
  title?: string;
  hideWhenEmpty?: boolean;
  emptyText?: string;
}) {
  const { program, ready } = useContentProgram();
  const { data: user } = useCurrentUser();

  const query = useInfiniteQuery({
    queryKey: [
      "content",
      "publisher",
      publisherKind,
      publisherId,
      user?.id ?? null,
    ],
    enabled: ready && program.spotlight,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const res = await listPublisherContent({
        publisherKind,
        publisherId,
        kind: "spotlight",
        cursor: pageParam ?? undefined,
      });
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });

  if (!ready || !program.spotlight) return null;

  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];
  if (hideWhenEmpty && !query.isLoading && posts.length === 0) return null;

  return (
    <section className="space-y-3">
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      {query.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn't load Spotlights.
        </p>
      ) : posts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1 sm:gap-2 md:grid-cols-4">
          {posts.map((post) => {
            const cover = post.media[0];
            const src =
              cover?.type === "video"
                ? (cover.thumbnailUrl ?? cover.posterUrl)
                : (cover?.thumbnailUrl ?? cover?.mediaUrl);
            return (
              <li key={post.id}>
                <Link
                  href={spotlightPath(post.id)}
                  className="relative block aspect-[9/16] overflow-hidden rounded-md bg-muted"
                >
                  {src ? (
                    <Image
                      src={src}
                      alt={post.caption?.slice(0, 80) ?? "Spotlight"}
                      fill
                      sizes="(max-width: 768px) 33vw, 200px"
                      className="object-cover"
                    />
                  ) : null}
                  <span className="absolute bottom-1 left-1 flex items-center gap-0.5 text-xs font-semibold text-white drop-shadow">
                    <IoPlay aria-hidden />
                    {post.counts.views.toLocaleString()}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {query.hasNextPage ? (
        <button
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          className="w-full text-center text-sm font-medium text-primary hover:underline disabled:opacity-60"
        >
          {query.isFetchingNextPage ? "Loading…" : "Show more"}
        </button>
      ) : null}
    </section>
  );
}
