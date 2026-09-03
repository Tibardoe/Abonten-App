import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type {
  NotificationEntityKind,
  NotificationType,
} from "@abonten/types/notificationType";
import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

const KIND_ICON: Record<NotificationEntityKind, IoniconName> = {
  ticket: "ticket-outline",
  event: "calendar-outline",
  event_featured: "sparkles-outline",
  place: "storefront-outline",
  place_featured: "sparkles-outline",
  review_reply: "chatbubble-ellipses-outline",
  profile: "person-circle-outline",
  place_claim: "shield-checkmark-outline",
  place_booking: "bookmark-outline",
};

function fallbackIcon(kind?: NotificationEntityKind): IoniconName {
  return (kind && KIND_ICON[kind]) || "notifications-outline";
}

function Thumbnail({ item }: { item: NotificationType }) {
  const [failed, setFailed] = useState(false);
  const hasImage = !!item.image_public_id && !!item.image_version && !failed;

  if (hasImage) {
    return (
      <Image
        source={{
          uri: buildCloudinaryUrl(
            item.image_public_id as string,
            item.image_version as string,
            { width: 112, height: 112 },
          ),
        }}
        style={{ width: 48, height: 48, borderRadius: 10 }}
        contentFit="cover"
        transition={120}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View className="h-12 w-12 items-center justify-center rounded-[10px] bg-muted">
      <Icon name={fallbackIcon(item.data?.kind)} size={20} tone="muted" />
    </View>
  );
}

export function NotificationItem({
  item,
  onPress,
}: {
  item: NotificationType;
  onPress: () => void;
}) {
  const unread = !item.read_at;
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row gap-3 rounded-xl border p-3 active:opacity-80 ${
        unread ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <Thumbnail item={item} />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-start gap-2">
          <AppText
            variant={unread ? "bodyStrong" : "body"}
            className="flex-1"
            numberOfLines={2}
          >
            {item.title}
          </AppText>
          {unread ? (
            <View className="mt-1.5 h-2 w-2 rounded-full bg-primary" />
          ) : null}
        </View>
        {item.body ? (
          <AppText variant="meta" numberOfLines={2}>
            {item.body}
          </AppText>
        ) : null}
        <AppText variant="caption">
          {formatDateWithSuffix(item.created_at)}
        </AppText>
      </View>
    </Pressable>
  );
}
