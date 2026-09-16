import { trackContentClick } from "@/features/content/useContentTelemetry";
import { contentCtaLabel } from "@abonten/core/content/copy";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { AppText, Icon } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// The call to action under a post. Wording follows the live state of the
// attached event or place, so an ended or cancelled event never offers
// "View event".
export function ContentCta({
  post,
  campaignId,
  onNavigate,
}: {
  post: ContentPostDocument;
  campaignId?: string | null;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const cta = contentCtaLabel(post);
  if (!cta.label) return null;

  let href: string | null = null;
  if (cta.target === "event" && post.event)
    href = `/(app)/event/${post.event.id}`;
  else if (cta.target === "place") {
    href = post.place
      ? `/(app)/place/${post.place.id}`
      : post.publisher.kind === "place"
        ? `/(app)/place/${post.publisher.id}`
        : null;
  } else if (cta.target === "profile" && post.publisher.username) {
    href = `/(app)/user/${post.publisher.username}`;
  }

  if (!href || !cta.target) {
    return (
      <View className="rounded-lg bg-black/40 px-3 py-2.5">
        <AppText className="text-[14px] font-semibold text-white/80">
          {cta.label}
        </AppText>
      </View>
    );
  }

  const target = cta.target;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        trackContentClick(post.id, target, campaignId);
        onNavigate?.();
        router.push(href as never);
      }}
      className="flex-row items-center justify-between rounded-lg bg-white px-3 py-2.5 active:opacity-80"
    >
      <AppText className="text-[14px] font-semibold text-black">
        {cta.label}
      </AppText>
      <Icon name="chevron-forward" size={16} color="#000" />
    </Pressable>
  );
}
