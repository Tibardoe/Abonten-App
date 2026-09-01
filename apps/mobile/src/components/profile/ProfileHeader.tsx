import type { PublicProfile } from "@/features/profile/usePublicProfile";
import { AppText, Avatar, Button, SectionTitle } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { View } from "react-native";

// Native echo of the web ProfileDetails header (mobile layout): avatar +
// username, full name, the Posts / Favorites / Ratings counts, bio, and —
// on your own profile — an Edit profile action. Highlights are a later
// pass (docs/mobile/09).

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
            {profile.username}
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

      {profile.full_name ? (
        <AppText variant="bodyStrong">{profile.full_name}</AppText>
      ) : null}
      {profile.bio ? <AppText variant="body">{profile.bio}</AppText> : null}

      {isOwn ? (
        <Button
          title="Edit profile"
          variant="outline"
          onPress={() => router.push("/(app)/account")}
        />
      ) : null}

      <SectionTitle>Highlights</SectionTitle>
      <AppText variant="caption">Highlights aren't on mobile yet.</AppText>
    </View>
  );
}
