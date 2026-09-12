import {
  BADGE_EXPLANATION,
  BADGE_LABEL,
} from "@abonten/core/verification/copy";
import type { VerificationSubjectType } from "@abonten/types/verificationType";
import { AppText, Icon } from "@abonten/ui-native";
import { Alert, Pressable, View } from "react-native";

// The public Verified badge. It is deliberately tappable: the badge alone
// overstates what Abonten checked, so every surface that shows it must be
// able to explain it in the same legal-reviewed words as the web popover
// (VerifiedBadgePopover). Both read BADGE_EXPLANATION so they cannot drift.
//
// "overlay" is the pill that sits on a dark hero image; "inline" is the small
// badge next to a name on a light card.
export function VerifiedPill({
  subjectType,
  variant = "inline",
}: {
  subjectType: VerificationSubjectType;
  variant?: "overlay" | "inline";
}) {
  const overlay = variant === "overlay";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${BADGE_LABEL[subjectType]} — what this means`}
      hitSlop={6}
      onPress={() =>
        Alert.alert(BADGE_LABEL[subjectType], BADGE_EXPLANATION[subjectType], [
          { text: "Got it" },
        ])
      }
      className={
        overlay
          ? "flex-row items-center gap-1 rounded-full bg-black/40 px-3 py-1 active:opacity-70"
          : "flex-row items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 active:opacity-70"
      }
    >
      <Icon
        name="checkmark-circle"
        size={13}
        tone="primary"
        color={overlay ? "#fff" : undefined}
      />
      <AppText
        className={
          overlay
            ? "text-[12px] font-semibold text-white"
            : "text-[11px] font-semibold text-primary"
        }
      >
        Verified
      </AppText>
    </Pressable>
  );
}

/** Convenience guard: a suspended or banned organizer keeps the case but loses the badge. */
export function showsOrganizerBadge(
  info: {
    organizer_verified?: boolean | null;
    status_id?: number | null;
  } | null,
): boolean {
  return !!info?.organizer_verified && info.status_id === 1;
}
