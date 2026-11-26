import { AppText, Icon, type IoniconName, Sheet } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The ⋯ menu on a place: report it, and on a place someone runs the quiet
// "I own this business" (@abonten/core/placeClaimInvite), which opens the
// claim sheet worded as an ownership dispute. Until 2026-11-26 the header
// had only a flag, and every place showed a "Claim it" card instead.

export type PlaceAction = "report" | "dispute";

const ICONS: Record<PlaceAction, IoniconName> = {
  report: "flag-outline",
  dispute: "storefront-outline",
};

export function PlaceActionsSheet({
  open,
  onClose,
  onDismiss,
  actions,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  /** The rows to offer, each with its label. */
  actions: { action: PlaceAction; label: string }[];
  onAction: (action: PlaceAction) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} onDismiss={onDismiss}>
      <View className="gap-1 pb-2">
        {actions.map(({ action, label }) => (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onAction(action)}
            className="min-h-[52px] flex-row items-center gap-3 rounded-lg px-1 py-3 active:opacity-70"
          >
            <Icon name={ICONS[action]} size={20} tone="foreground" />
            <AppText variant="body" tone="primary">
              {label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
