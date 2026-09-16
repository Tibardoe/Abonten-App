"use client";

import { cn } from "@/components/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { FollowTargetKind } from "@abonten/types/contentType";
import { useContentProgram } from "../hooks/useContentProgram";
import { useFollow } from "../hooks/useFollow";

// Public Follow for an organizer or a place. Following shapes the Following
// feed and the Stories row. Separate from the private "Notify me" bell,
// which is about alerts. Hidden on your own profile or place, and while
// neither Spotlight nor Stories is on for the visitor.
export default function FollowButton({
  kind,
  targetId,
  ownerId,
  label,
  showCount = false,
  variant = "default",
  className,
  known,
}: {
  kind: FollowTargetKind;
  targetId: string;
  ownerId?: string | null;
  label: string;
  showCount?: boolean;
  /** "overlay" for use on top of media. */
  variant?: "default" | "overlay";
  className?: string;
  /** The viewer's follow state when a post document already carries it. */
  known?: boolean;
}) {
  const { program } = useContentProgram();
  const { data: user } = useCurrentUser();
  const requireAuth = useRequireAuth();
  const visible = program.spotlight || program.stories;
  // Cards pass what the post document already says, so a feed page doesn't
  // make one follow-status request per publisher.
  const { status, toggle } = useFollow(
    kind,
    targetId,
    visible,
    showCount ? undefined : known,
  );

  if (!visible) return null;
  if (user && ownerId && user.id === ownerId) return null;

  const following = status.data?.following ?? known ?? false;
  const count = status.data?.followerCount ?? 0;

  return (
    <button
      type="button"
      aria-pressed={following}
      aria-label={following ? `Unfollow ${label}` : `Follow ${label}`}
      disabled={toggle.isPending}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!(await requireAuth())) return;
        toggle.mutate(!following);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
        variant === "overlay"
          ? following
            ? "border border-white/60 bg-black/30 text-white"
            : "bg-white text-black hover:bg-white/90"
          : following
            ? "border border-border bg-transparent text-foreground hover:bg-accent"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      {following ? "Following" : "Follow"}
      {showCount && count > 0 ? (
        <span className="font-normal opacity-80">
          · {count.toLocaleString()}
        </span>
      ) : null}
    </button>
  );
}
