"use client";

import { useEventShare } from "@/hooks/useEventShare";
import { weeklyEditionPath, weeklyShareText } from "@abonten/core/weekly/copy";
import { IoShareSocialOutline } from "react-icons/io5";

// Shares a dated edition link. The same share hook as events: the native
// share sheet (or copy link), with the signed-in sharer's referral code
// attached only while Abonten Rewards referral capture is on. No new
// referral mechanism: an edition link counts like any other invite link.
export default function WeeklyShareButton({
  scopeSlug,
  scopeName,
  weekStart,
  title,
}: {
  scopeSlug: string;
  scopeName: string;
  weekStart: string;
  title: string;
}) {
  const origin =
    typeof window === "undefined"
      ? (process.env.NEXT_PUBLIC_BASE_URL ?? "")
      : window.location.origin;
  const share = useEventShare({
    title: weeklyShareText(title, scopeName),
    text: "Check out this week's Abonten Weekly.",
    url: `${origin}${weeklyEditionPath(scopeSlug, weekStart)}`,
  });

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
    >
      <IoShareSocialOutline aria-hidden className="text-lg" />
      Share
    </button>
  );
}
