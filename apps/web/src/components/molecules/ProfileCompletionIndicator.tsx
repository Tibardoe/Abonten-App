"use client";

import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import Link from "next/link";

// Compact "2/4" progress badge with a ring, shown in the Edit Profile
// header block (Part 17: reuse an existing surface rather than adding
// something to global nav). Renders nothing once the profile is complete,
// and nothing while loading/signed out.
export default function ProfileCompletionIndicator() {
  const { data: completion } = useProfileCompletion();

  if (!completion || completion.isComplete) return null;

  const { completedCount, total } = completion;
  const fraction = completedCount / total;
  const circumference = 2 * Math.PI * 9;

  return (
    <Link
      href="/settings/edit-profile"
      className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground/80 hover:bg-accent transition-colors"
      aria-label={`Profile ${completedCount} of ${total} complete`}
    >
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: purely decorative, the parent Link already carries the accessible aria-label */}
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle
          cx="10"
          cy="10"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-border"
        />
        <circle
          cx="10"
          cy="10"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          strokeLinecap="round"
          transform="rotate(-90 10 10)"
          className="text-mint"
        />
      </svg>
      <span>
        {completedCount}/{total}
      </span>
    </Link>
  );
}
