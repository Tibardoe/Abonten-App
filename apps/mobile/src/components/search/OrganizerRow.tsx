import { SubscribeBell } from "@/components/alerts/SubscribeBell";
import { VerifiedPill } from "@/components/verification/VerifiedPill";
import type { SearchOrganizerHit } from "@abonten/types/searchType";
import { AppText, Avatar, Icon } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// One organizer in search results: avatar, name, @handle, Verified, how
// active they are, and the private "Notify me" bell.
export function OrganizerRow({
  organizer,
  onOpen,
  onSeeEvents,
}: {
  organizer: SearchOrganizerHit;
  onOpen?: () => void;
  onSeeEvents?: () => void;
}) {
  const router = useRouter();
  const open = () => {
    onOpen?.();
    router.push(`/(app)/user/${organizer.username}`);
  };
  const facts = [
    organizer.upcomingCount > 0 ? `${organizer.upcomingCount} upcoming` : null,
    organizer.placeCount > 0
      ? `${organizer.placeCount} ${organizer.placeCount === 1 ? "place" : "places"}`
      : null,
    organizer.ratingCount > 0 && organizer.avgRating != null
      ? `★ ${organizer.avgRating.toFixed(1)} (${organizer.ratingCount})`
      : null,
  ].filter(Boolean);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open @${organizer.username}`}
        onPress={open}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        <Avatar
          publicId={organizer.avatarPublicId ?? undefined}
          version={organizer.avatarVersion ?? undefined}
          size={52}
        />
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <AppText variant="bodyStrong" numberOfLines={1} className="shrink">
              {organizer.fullName || `@${organizer.username}`}
            </AppText>
            {organizer.verified ? (
              <VerifiedPill subjectType="organizer" />
            ) : null}
          </View>
          <AppText variant="meta" tone="muted" numberOfLines={1}>
            @{organizer.username}
            {organizer.isNew ? " · New" : ""}
          </AppText>
          {facts.length ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {facts.join(" · ")}
            </AppText>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={16} tone="muted" />
      </Pressable>
      <View className="flex-row flex-wrap items-center gap-2">
        {organizer.upcomingCount > 0 && onSeeEvents ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSeeEvents}
            className="h-10 justify-center rounded-full bg-primary px-4 active:opacity-80"
          >
            <AppText variant="label" className="text-primary-foreground">
              See their events
            </AppText>
          </Pressable>
        ) : null}
        <SubscribeBell
          kind="organizer"
          targetId={organizer.id}
          ownerId={organizer.id}
          label={`@${organizer.username}`}
        />
      </View>
    </View>
  );
}
