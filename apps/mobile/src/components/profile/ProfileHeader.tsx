import { HighlightsRow } from "@/components/profile/HighlightsRow";
import type { PublicProfile } from "@/features/profile/usePublicProfile";
import { AppText, Avatar, Button } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { View } from "react-native";

// Native echo of the web ProfileDetails header (mobile layout): avatar,
// full name, the Posts / Favorites / Ratings counts, bio, the highlights
// strip, and — on your own profile — an Edit profile action. The @username
// itself is the screen's centred nav title (set from the profile screen),
// so it isn't repeated here.

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

  return (
    <View className="gap-4 px-4 pt-4">
      <View className="flex-row items-center gap-4">
        <Avatar
          publicId={profile.avatar_public_id ?? undefined}
          version={profile.avatar_version ?? undefined}
          size={84}
        />
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
    </View>
  );
}
