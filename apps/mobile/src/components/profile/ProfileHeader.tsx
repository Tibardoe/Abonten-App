import { ImageViewer } from "@/components/ImageViewer";
import { HighlightsRow } from "@/components/profile/HighlightsRow";
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

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="items-center">
      <AppText variant="bodyStrong">{value}</AppText>
      <AppText variant="caption">{label}</AppText>
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
          <AppText variant="bodyStrong" numberOfLines={1}>
            {profile.full_name ?? `@${profile.username}`}
          </AppText>
          <View className="flex-row justify-between">
            <Stat value={profile.total_posts} label="Posts" />
            <Stat value={profile.total_favorites} label="Favorites" />
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
      ) : null}

      <HighlightsRow
        userId={profile.user_id}
        username={profile.username}
        isOwn={isOwn}
      />

      <ImageViewer
        uri={fullPhoto}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}
