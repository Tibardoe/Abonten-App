import { AppText, Icon, type IoniconName, Sheet } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The ⋯ menu on someone else's profile: report them, block or unblock
// them. Until 2026-11-06 the profile had only a flag icon, and a person
// could be blocked only from one of their reviews or a chat.

export type ProfileAction = "report" | "block" | "unblock";

const ICONS: Record<ProfileAction, IoniconName> = {
  report: "flag-outline",
  block: "ban-outline",
  unblock: "ban-outline",
};

export function ProfileActionsSheet({
  open,
  onClose,
  onDismiss,
  actions,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  /** The rows to offer, each with its label ("Block @ama"). */
  actions: { action: ProfileAction; label: string }[];
  onAction: (action: ProfileAction) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} onDismiss={onDismiss}>
      <View className="gap-1 pb-2">
        {actions.map(({ action, label }) => {
          const destructive = action === "block";
          return (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onAction(action)}
              className="min-h-[52px] flex-row items-center gap-3 rounded-lg px-1 py-3 active:opacity-70"
            >
              <Icon
                name={ICONS[action]}
                size={20}
                tone={destructive ? "destructive" : "foreground"}
              />
              <AppText variant="body" tone={destructive ? "error" : "primary"}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
