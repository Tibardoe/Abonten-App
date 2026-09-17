import { trackContentClick } from "@/features/content/useContentTelemetry";
import { hapticLight } from "@/lib/haptics";
import { contentDestinationCta } from "@abonten/core/content/copy";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { AppText, Icon } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// The full-width call to action along the bottom of a Spotlight or Story
// when it points at an event or place. Wording follows the live state of
// that event or place, so an ended or cancelled event says so in a quiet
// bar instead of offering "View event". The publisher's own profile is not
// a CTA here — the avatar and name above already open it.
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
  const cta = contentDestinationCta(post);
  if (!cta.label) return null;

  let href: string | null = null;
  if (cta.target === "event" && post.event) {
    href = `/(app)/event/${post.event.id}`;
  } else if (cta.target === "place" && post.place) {
    href = `/(app)/place/${post.place.id}`;
  }
  const icon = post.event ? "calendar-outline" : "storefront-outline";

  if (!href || !cta.target) {
    return (
      <View
        accessible
        accessibilityLabel={cta.label}
        className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-white/15 px-4"
      >
        <Icon name="information-circle-outline" size={18} color="#fff" />
        <AppText className="text-[14px] font-semibold text-white/85">
          {cta.label}
        </AppText>
      </View>
    );
  }

  const target = cta.target;
  const title = post.event?.title ?? post.place?.name ?? null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title ? `${cta.label}: ${title}` : cta.label}
      onPress={() => {
        hapticLight();
        trackContentClick(post.id, target, campaignId);
        onNavigate?.();
        router.push(href as never);
      }}
      className="h-12 flex-row items-center gap-3 rounded-xl bg-white px-4 active:opacity-85"
    >
      <Icon name={icon} size={19} color="#000" />
      <View className="flex-1">
        <AppText numberOfLines={1} className="text-[15px] font-bold text-black">
          {cta.label}
        </AppText>
      </View>
      {title ? (
        <AppText
          numberOfLines={1}
          className="max-w-[45%] text-[13px] font-medium text-black/60"
        >
          {title}
        </AppText>
      ) : null}
      <Icon name="chevron-forward" size={17} color="#000" />
    </Pressable>
  );
}
