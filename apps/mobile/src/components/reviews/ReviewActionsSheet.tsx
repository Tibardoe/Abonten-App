import { AppText, Icon, type IoniconName, Sheet } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The ⋯ menu on a review. Your own review: edit, delete, share. Someone
// else's: share, report, block the reviewer. Every action is decided again
// by the database (RLS, review_set_helpful, user_block_set, the report
// service) — this only offers the ones that apply.

export type ReviewAction = "edit" | "delete" | "share" | "report" | "block";

const ROWS: Record<
  ReviewAction,
  { icon: IoniconName; label: string; destructive?: boolean }
> = {
  edit: { icon: "create-outline", label: "Edit review" },
  delete: { icon: "trash-outline", label: "Delete review", destructive: true },
  share: { icon: "share-outline", label: "Share review" },
  report: { icon: "flag-outline", label: "Report review" },
  block: { icon: "ban-outline", label: "Block", destructive: true },
};

export function ReviewActionsSheet({
  open,
  onClose,
  onDismiss,
  actions,
  blockLabel,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  actions: ReviewAction[];
  /** e.g. "Block ama" */
  blockLabel?: string;
  onAction: (action: ReviewAction) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} onDismiss={onDismiss}>
      <View className="gap-1 pb-2">
        {actions.map((action) => {
          const row = ROWS[action];
          const label =
            action === "block" && blockLabel ? blockLabel : row.label;
          return (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onAction(action)}
              className="min-h-[52px] flex-row items-center gap-3 rounded-lg px-1 py-3 active:opacity-70"
            >
              <Icon
                name={row.icon}
                size={20}
                tone={row.destructive ? "destructive" : "foreground"}
              />
              <AppText
                variant="body"
                tone={row.destructive ? "error" : "primary"}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
