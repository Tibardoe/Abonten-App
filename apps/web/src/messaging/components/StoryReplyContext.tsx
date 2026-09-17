"use client";

import { cn } from "@/components/lib/utils";
import { storyPath } from "@abonten/core/content/links";
import {
  readStoryReplyContext,
  storyReplyLabel,
  storyReplyStoryLive,
} from "@abonten/core/content/storyReply";
import { Clock, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/**
 * The Story a message answers, above its bubble: "Replied to your story"
 * with a small preview that opens the Story while it is up, and a quiet
 * "Story ended" placeholder after. Same wording as mobile
 * (@abonten/core/content/storyReply).
 */
export function StoryReplyContext({
  systemData,
  isMine,
}: {
  systemData: Record<string, unknown> | null | undefined;
  isMine: boolean;
}) {
  const ctx = readStoryReplyContext(systemData);
  if (!ctx) return null;
  const live = storyReplyStoryLive(ctx);
  const label = storyReplyLabel(ctx, isMine);

  return (
    <div
      className={cn(
        "mb-1 flex flex-col gap-1",
        isMine ? "items-end" : "items-start",
      )}
    >
      <span className="px-1 text-xs text-muted-foreground">{label}</span>
      {live && ctx.thumbnailUrl ? (
        <Link
          href={storyPath(ctx.postId)}
          aria-label={`${label}. Open the story`}
          className="relative block h-[104px] w-[64px] overflow-hidden rounded-xl bg-muted hover:opacity-90"
        >
          <Image
            src={ctx.thumbnailUrl}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
          />
          {ctx.mediaType === "video" ? (
            <Play className="absolute bottom-1.5 left-1.5 h-3 w-3 fill-white text-white" />
          ) : null}
        </Link>
      ) : (
        <span className="flex h-[52px] w-[64px] flex-col items-center justify-center rounded-xl border border-dashed text-[10px] text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden />
          Story ended
        </span>
      )}
    </div>
  );
}
