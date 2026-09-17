import { useSession } from "@/auth/SessionProvider";
import { useRequireSignIn } from "@/features/content/contentLinks";
import { useFollow } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { hapticSelection } from "@/lib/haptics";
import type { FollowTargetKind } from "@abonten/types/contentType";
import { AppText } from "@abonten/ui-native";
import { Pressable } from "react-native";

// Public Follow for an organizer or place: fills the Following feed and the
// Stories row. Separate from the private "Notify me" bell. Hidden on your
// own profile or place and while neither Spotlight nor Stories is on.
//
// `inline` is the compact pill that sits right after a creator's name on a
// Spotlight or Story ("@ama  Follow"), so what is being followed is never in
// doubt. The toggle is optimistic (useFollow rolls back and toasts on a
// failure) and ignores taps while a request is in flight, so a double tap
// never sends two.
export function FollowButton({
  kind,
  targetId,
  ownerId,
  label,
  onMedia = false,
  inline = false,
  showCount = false,
  known,
}: {
  kind: FollowTargetKind;
  targetId: string | undefined;
  ownerId?: string | null;
  label: string;
  /** White styling for use on top of photos and video. */
  onMedia?: boolean;
  /** Compact pill beside a name (Spotlight, Story). */
  inline?: boolean;
  showCount?: boolean;
  /** The viewer's follow state when a post document already carries it. */
  known?: boolean;
}) {
  const { session } = useSession();
  const { program } = useContentProgram();
  const requireSignIn = useRequireSignIn();
  const visible = program.spotlight || program.stories;
  // Cards pass what the post document already says, so a feed page doesn't
  // make one follow-status request per publisher; profiles still fetch the
  // count.
  const { status, toggle } = useFollow(
    kind,
    targetId,
    visible,
    showCount ? undefined : known,
  );

  if (!visible || !targetId) return null;
  if (session && ownerId && session.user.id === ownerId) return null;

  const following = status.data?.following ?? known ?? false;
  const count = status.data?.followerCount ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: following, busy: toggle.isPending }}
      accessibilityLabel={following ? `Unfollow ${label}` : `Follow ${label}`}
      hitSlop={inline ? 10 : 6}
      onPress={() => {
        if (toggle.isPending) return;
        if (!requireSignIn()) return;
        hapticSelection();
        toggle.mutate(!following);
      }}
      className={[
        "flex-row items-center justify-center rounded-full",
        inline ? "h-7 px-3" : "min-h-[32px] px-3.5",
        onMedia
          ? following
            ? "border border-white/50 bg-black/25"
            : "bg-white"
          : following
            ? "border border-border bg-transparent"
            : "bg-primary",
      ].join(" ")}
    >
      <AppText
        numberOfLines={1}
        className={[
          inline ? "text-[12px] font-bold" : "text-[13px] font-semibold",
          onMedia
            ? following
              ? "text-white"
              : "text-black"
            : following
              ? "text-foreground"
              : "text-primary-foreground",
        ].join(" ")}
      >
        {following ? "Following" : "Follow"}
        {showCount && count > 0 ? ` · ${count.toLocaleString()}` : ""}
      </AppText>
    </Pressable>
  );
}
