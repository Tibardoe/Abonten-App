import type { WeeklyBannerSlide } from "@abonten/types/weeklyType";
import { AppText } from "@abonten/ui-native";
import type { ReactNode } from "react";
import { View } from "react-native";

// Small pieces shared by the Abonten Weekly banners in the app.

/** Translucent label chip for text over a banner photo. */
export function WeeklyChip({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <View
      className="rounded-full px-3 py-1.5"
      style={{
        backgroundColor: strong ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.35)",
        borderWidth: 1,
        borderColor: strong
          ? "rgba(255,255,255,0.24)"
          : "rgba(255,255,255,0.14)",
      }}
    >
      <AppText
        className={
          strong
            ? "text-[11px] font-bold uppercase tracking-widest text-white"
            : "text-[11px] font-medium text-white"
        }
        numberOfLines={1}
      >
        {children}
      </AppText>
    </View>
  );
}

/** The app screen for the listing a banner slide shows. */
export function weeklyListingPath(slide: WeeklyBannerSlide): string {
  return slide.subjectType === "event"
    ? `/(app)/event/${slide.subjectId}`
    : `/(app)/place/${slide.subjectId}`;
}
