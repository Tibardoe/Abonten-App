import { FollowButton } from "@/components/content/FollowButton";
import { VerifiedPill } from "@/components/verification/VerifiedPill";
import { useCoreI18n } from "@/features/i18n/useCoreI18n";
import { recordShowcaseTap } from "@/features/showcase/useShowcase";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import {
  DEFAULT_AVATAR,
  buildCloudinaryUrl,
} from "@abonten/core/cloudinaryUrl";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { showcaseNextUp } from "@abonten/core/showcase/rules";
import type { ShowcaseTile as Tile } from "@abonten/types/showcaseType";
import { AppText, useReducedMotion } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// One host or place on the "On Abonten" wall: picture and name (with the
// Verified mark when they have it), what is next ("Fri, 4 Dec · Afro-house
// night", or for a place "Open now" / its kind and area), a pulsing dot
// when something of theirs is on today or this weekend, and Follow.
// Tapping it opens their profile or place and counts the tap.

export const SHOWCASE_TILE_WIDTH = 232;
const IMAGE = 52;

function SoonDot() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-primary"
      style={style}
    />
  );
}

export function ShowcaseTile({
  tile,
  now,
  fullWidth = false,
}: {
  tile: Tile;
  now: Date;
  /** The directory's single column instead of the wall's fixed width. */
  fullWidth?: boolean;
}) {
  const t = useTranslations("showcase");
  const i18n = useCoreI18n();
  const router = useRouter();

  const uri =
    tile.imagePublicId != null
      ? buildCloudinaryUrl(tile.imagePublicId, tile.imageVersion, {
          width: IMAGE,
          height: IMAGE,
        })
      : buildCloudinaryUrl(DEFAULT_AVATAR.publicId, DEFAULT_AVATAR.version, {
          width: IMAGE,
          height: IMAGE,
        });

  const next = showcaseNextUp(tile, now);
  let line: string | null = null;
  if (next?.kind === "event") {
    line = next.onNow
      ? t("onNow", { title: next.title })
      : t("nextUp", {
          date: getEventCardDateTime(
            next.startsAt,
            next.endsAt,
            null,
            next.timezone,
            i18n.locale,
          ).date,
          title: next.title,
        });
  } else if (next?.kind === "open_now") {
    line = t("openNow");
  } else if (next?.kind === "place_info") {
    const category =
      next.categorySlug || next.categoryName
        ? placeCategoryLabel(i18n.t, {
            slug: next.categorySlug,
            name: next.categoryName,
          })
        : "";
    if (category && next.area) {
      line = t("categoryInArea", { category, area: next.area });
    } else {
      line = category || next.area;
    }
  }
  const soon = next?.kind === "event" && next.soon;

  const open = () => {
    recordShowcaseTap(tile.entryId);
    if (tile.kind === "host") {
      if (tile.username) router.push(`/(app)/user/${tile.username}`);
    } else {
      router.push(`/(app)/place/${tile.subjectId}`);
    }
  };

  return (
    <View
      style={{ width: fullWidth ? "100%" : SHOWCASE_TILE_WIDTH }}
      className="gap-3 rounded-2xl border border-border bg-card p-3"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          line
            ? t("tileLabel", {
                name: tile.name,
                line: soon ? t("soonLine", { line }) : line,
              })
            : tile.name
        }
        accessibilityHint={t("openPage", { name: tile.name })}
        onPress={open}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        <View style={{ width: IMAGE, height: IMAGE }}>
          <Image
            source={{ uri }}
            style={{
              width: IMAGE,
              height: IMAGE,
              borderRadius: tile.kind === "host" ? IMAGE / 2 : 12,
            }}
            contentFit="cover"
            transition={120}
            recyclingKey={tile.entryId}
            accessibilityIgnoresInvertColors
          />
          {soon ? <SoonDot /> : null}
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1">
            <AppText variant="bodyStrong" numberOfLines={1} className="shrink">
              {tile.name}
            </AppText>
            {tile.verified ? (
              <VerifiedPill
                variant="icon"
                subjectType={tile.kind === "host" ? "organizer" : "place"}
                team={tile.kind === "host" && tile.isTeam}
              />
            ) : null}
          </View>
          {line ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {line}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <FollowButton
        kind={tile.kind === "host" ? "organizer" : "place"}
        targetId={tile.subjectId}
        ownerId={tile.kind === "host" ? tile.subjectId : tile.ownerId}
        label={tile.name}
        known={tile.following}
        showcaseEntryId={tile.entryId}
      />
    </View>
  );
}
