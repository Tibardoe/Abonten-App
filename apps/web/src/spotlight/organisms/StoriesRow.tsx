"use client";

import { getStoryTray } from "@/actions/content/getStoryTray";
import { cn } from "@/components/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { YOUR_STORY_LABEL } from "@abonten/core/content/copy";
import type { StoryTrayEntry } from "@abonten/types/contentType";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { IoAdd } from "react-icons/io5";
import { useContentProgram } from "../hooks/useContentProgram";
import { publisherAvatarUrl, publisherLabel } from "../lib/publisher";
import { dataOf } from "../lib/result";
import StoryViewer, { type StoryQueueEntry } from "./StoryViewer";

// The Stories row at the top of Messages: "Your Story" first when the
// visitor can publish, then the organizers and places they follow, unseen
// first. Renders nothing while Stories is off for this visitor.
export default function StoriesRow({ className }: { className?: string }) {
  const { program } = useContentProgram();
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState<{
    queue: StoryQueueEntry[];
    start: number;
  } | null>(null);

  const tray = useQuery({
    queryKey: ["content", "stories", "tray", user?.id ?? null],
    enabled: program.stories && !!user,
    queryFn: async () => dataOf(await getStoryTray()),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!program.stories || !user) return null;

  const entries = tray.data?.entries ?? [];
  const self = entries.find((e) => e.isSelf) ?? null;
  const others = entries.filter((e) => !e.isSelf && !e.muted);
  const canPublish = !!tray.data?.canPublish && program.storiesPosting;

  if (tray.isLoading) {
    return (
      <div className={cn("flex gap-3 overflow-hidden px-3 py-3", className)}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={`s-${i.toString()}`}
            className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-muted"
          />
        ))}
      </div>
    );
  }

  if (!self && others.length === 0 && !canPublish) return null;

  const queue: StoryQueueEntry[] = others.map((e) => ({
    publisherKind: e.publisher.kind,
    publisherId: e.publisher.id,
  }));

  return (
    <>
      <ul
        aria-label="Stories"
        className={cn(
          "flex gap-3 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {self ? (
          <StoryBubble
            entry={self}
            label={YOUR_STORY_LABEL}
            onOpen={() =>
              setOpen({
                queue: [
                  {
                    publisherKind: self.publisher.kind,
                    publisherId: self.publisher.id,
                  },
                ],
                start: 0,
              })
            }
            addHref={canPublish ? "/manage/spotlight?new=story" : undefined}
          />
        ) : canPublish ? (
          <li className="w-16 shrink-0">
            <Link
              href="/manage/spotlight?new=story"
              className="flex flex-col items-center gap-1"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted text-muted-foreground">
                <IoAdd className="text-2xl" />
              </span>
              <span className="w-full truncate text-center text-[11px]">
                {YOUR_STORY_LABEL}
              </span>
            </Link>
          </li>
        ) : null}

        {others.map((entry, i) => (
          <StoryBubble
            key={`${entry.publisher.kind}:${entry.publisher.id}`}
            entry={entry}
            label={publisherLabel(entry.publisher)}
            onOpen={() => setOpen({ queue, start: i })}
          />
        ))}
      </ul>

      {open ? (
        <StoryViewer
          queue={open.queue}
          startIndex={open.start}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function StoryBubble({
  entry,
  label,
  onOpen,
  addHref,
}: {
  entry: StoryTrayEntry;
  label: string;
  onOpen: () => void;
  addHref?: string;
}) {
  return (
    <li className="relative flex w-16 shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label} Stories${entry.hasUnseen ? ", new" : ""}`}
        className={cn(
          "rounded-full p-[2px]",
          entry.hasUnseen
            ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-primary"
            : "bg-border",
        )}
      >
        <span className="block rounded-full bg-background p-[2px]">
          <span className="relative block h-12 w-12 overflow-hidden rounded-full bg-muted">
            <Image
              src={publisherAvatarUrl(entry.publisher, 48)}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
            />
          </span>
        </span>
      </button>
      {addHref ? (
        <Link
          href={addHref}
          aria-label="Add to your Story"
          className="absolute right-0 top-9 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
        >
          <IoAdd className="text-xs" />
        </Link>
      ) : null}
      <span
        className={cn(
          "w-full truncate text-center text-[11px]",
          entry.hasUnseen ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </li>
  );
}
