import { ImageViewer } from "@/components/ImageViewer";
import { SubscribeBell } from "@/components/alerts/SubscribeBell";
import { FollowButton } from "@/components/content/FollowButton";
import { HighlightsRow } from "@/components/profile/HighlightsRow";
import {
  VerifiedPill,
  showsOrganizerBadge,
} from "@/components/verification/VerifiedPill";
import type { PublicProfile } from "@/features/profile/usePublicProfile";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { AppText, Avatar, Button } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

// Native echo of the web ProfileDetails header (mobile layout): avatar,
// full name, the Posts / Favorites / Ratings counts, bio, the highlights
// strip, and — on your own profile — an Edit profile action. The @username
// itself is the screen's centred nav title (set from the profile screen),
// so it isn't repeated here. Tapping the avatar opens it full-screen.

function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function Stat({
  value,
  label,
  accessibilityLabel,
}: {
  value: string | number;
  label: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      className="min-w-0 flex-1 items-center"
      accessible
      accessibilityLabel={accessibilityLabel ?? `${value} ${label}`}
    >
      <AppText variant="bodyStrong" numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="caption" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function ProfileHeader({
  profile,
  isOwn,
}: {
  profile: PublicProfile;
  isOwn: boolean;
}) {
  const router = useRouter();
  const [viewerOpen, setViewerOpen] = useState(false);

  const fullPhoto = profile.avatar_public_id
    ? buildCloudinaryUrl(
        profile.avatar_public_id,
        String(profile.avatar_version ?? ""),
        { width: 1080, height: 1080 },
      )
    : null;

  return (
    <View className="gap-4 px-4 pt-4">
      <View className="flex-row items-center gap-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View profile photo"
          disabled={!fullPhoto}
          onPress={() => setViewerOpen(true)}
        >
          <Avatar
            publicId={profile.avatar_public_id ?? undefined}
            version={profile.avatar_version ?? undefined}
            size={84}
          />
        </Pressable>
        <View className="flex-1 gap-2">
          <View className="flex-row items-center gap-1.5">
            <AppText variant="bodyStrong" numberOfLines={1} className="shrink">
              {profile.full_name ?? `@${profile.username}`}
            </AppText>
            {showsOrganizerBadge(profile) ? (
              <VerifiedPill subjectType="organizer" />
            ) : null}
          </View>
          {/* Followers is the number people look for first on a profile —
              yours included — so it sits next to Posts. */}
          <View className="flex-row justify-between gap-1">
            <Stat value={compactCount(profile.total_posts)} label="Posts" />
            <Stat
              value={compactCount(profile.follower_count)}
              label={profile.follower_count === 1 ? "Follower" : "Followers"}
              accessibilityLabel={`${profile.follower_count.toLocaleString()} ${
                profile.follower_count === 1 ? "follower" : "followers"
              }`}
            />
            <Stat
              value={compactCount(profile.total_favorites)}
              label="Favorites"
            />
            <Stat
              value={profile.average_rating || "—"}
              label={`Rating${profile.total_ratings ? ` (${profile.total_ratings})` : ""}`}
            />
          </View>
        </View>
      </View>

      {profile.bio ? <AppText variant="body">{profile.bio}</AppText> : null}

      {isOwn ? (
        <Button
          title="Edit profile"
          variant="outline"
          onPress={() => router.push("/(app)/settings/edit-profile")}
        />
      ) : (
        <View className="flex-row items-center gap-2">
          <FollowButton
            kind="organizer"
            targetId={profile.user_id}
            ownerId={profile.user_id}
            label={`@${profile.username}`}
            known={profile.viewer_follows}
          />
          {profile.total_posts > 0 ? (
            <SubscribeBell
              kind="organizer"
              targetId={profile.user_id}
              ownerId={profile.user_id}
              label={`@${profile.username}`}
            />
          ) : null}
        </View>
      )}

      <HighlightsRow
        userId={profile.user_id}
        username={profile.username}
        isOwn={isOwn}
        avatarPublicId={profile.avatar_public_id}
        avatarVersion={profile.avatar_version}
      />

      {/* A profile's Spotlights live in their own tab below (a grid with
          Published / Saved / Drafts on your own profile), not a strip here. */}

      <ImageViewer
        uri={fullPhoto}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}
