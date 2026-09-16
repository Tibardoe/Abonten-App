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
export function FollowButton({
  kind,
  targetId,
  ownerId,
  label,
  onMedia = false,
  showCount = false,
}: {
  kind: FollowTargetKind;
  targetId: string | undefined;
  ownerId?: string | null;
  label: string;
  /** White styling for use on top of photos and video. */
  onMedia?: boolean;
  showCount?: boolean;
}) {
  const { session } = useSession();
  const { program } = useContentProgram();
  const requireSignIn = useRequireSignIn();
  const visible = program.spotlight || program.stories;
  const { status, toggle } = useFollow(kind, targetId, visible);

  if (!visible || !targetId) return null;
  if (session && ownerId && session.user.id === ownerId) return null;

  const following = !!status.data?.following;
  const count = status.data?.followerCount ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: following }}
      accessibilityLabel={following ? `Unfollow ${label}` : `Follow ${label}`}
      disabled={toggle.isPending}
      hitSlop={6}
      onPress={() => {
        if (!requireSignIn()) return;
        hapticSelection();
        toggle.mutate(!following);
      }}
      className={[
        "min-h-[32px] flex-row items-center justify-center rounded-full px-3.5",
        onMedia
          ? following
            ? "border border-white/60 bg-black/30"
            : "bg-white"
          : following
            ? "border border-border bg-transparent"
            : "bg-primary",
        toggle.isPending ? "opacity-60" : "",
      ].join(" ")}
    >
      <AppText
        className={[
          "text-[13px] font-semibold",
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
