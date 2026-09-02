import type {
  ProfilePlace,
  ProfileReview,
} from "@/features/profile/useProfileTabs";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { AppText, Icon, Stars } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// Compact list rows for the profile Places / Reviews tabs. Events and
// favourite events reuse the shared EventCard; places owned/favourited come
// back as raw `place` rows (no is_open / rating / distance from the list
// RPCs), so they get this lighter row instead of the full PlaceCard.

export function ProfilePlaceRow({ place }: { place: ProfilePlace }) {
  const router = useRouter();
  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 200,
          height: 200,
        })
      : null;
  const category = place.place_category?.name ?? place.category_name ?? "Place";

  return (
    <Pressable
      onPress={() => router.push(`/(app)/place/${place.id}`)}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-90"
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ width: 56, height: 56, borderRadius: 10 }}
          contentFit="cover"
        />
      ) : (
        <View className="h-14 w-14 items-center justify-center rounded-[10px] bg-muted">
          <Icon name="business-outline" size={20} tone="muted" />
        </View>
      )}
      <View className="flex-1">
        <AppText variant="bodyStrong" numberOfLines={1}>
          {place.name}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {category}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={18} tone="muted" />
    </Pressable>
  );
}

export function ProfileReviewRow({ review }: { review: ProfileReview }) {
  return (
    <View className="gap-1.5 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <AppText variant="bodyStrong" numberOfLines={1}>
          {review.reviewer?.username ?? "Someone"}
        </AppText>
        <Stars rating={review.rating} />
      </View>
      {review.place?.name ? (
        <AppText variant="caption" numberOfLines={1}>
          on {review.place.name}
        </AppText>
      ) : null}
      {review.title ? (
        <AppText variant="body" className="font-semibold">
          {review.title}
        </AppText>
      ) : null}
      {review.comment ? (
        <AppText variant="body">{review.comment}</AppText>
      ) : null}
      <AppText variant="caption">
        {formatDateWithSuffix(review.created_at)}
      </AppText>
    </View>
  );
}
