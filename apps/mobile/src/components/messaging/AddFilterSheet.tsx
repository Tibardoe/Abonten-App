import {
  CUSTOM_FILTER_ICON,
  CUSTOM_FILTER_KEYS,
  CUSTOM_FILTER_LABEL,
  type CustomFilterKey,
} from "@/features/messaging/inboxPrefs";
import {
  AppText,
  Button,
  Icon,
  type IoniconName,
  Sheet,
} from "@abonten/ui-native";
import { Pressable, View } from "react-native";

const HELP: Record<CustomFilterKey, string> = {
  unread: "Only conversations with new messages",
  events: "Conversations about events",
  places: "Conversations about places",
  muted: "Conversations you've muted",
};

// The "+" chip's target (spec §9–10). Not arbitrary queries — a fixed set
// of safe, predefined filters. Tapping a row toggles it on/off immediately;
// the chip row reflects it live.
export function AddFilterSheet({
  open,
  onClose,
  active,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  active: CustomFilterKey[];
  onToggle: (key: CustomFilterKey) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add filter"
      footer={<Button title="Done" onPress={onClose} />}
    >
      <View className="gap-2">
        {CUSTOM_FILTER_KEYS.map((key) => {
          const on = active.includes(key);
          return (
            <Pressable
              key={key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={CUSTOM_FILTER_LABEL[key]}
              onPress={() => onToggle(key)}
              className="min-h-[60px] flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
                <Icon
                  name={CUSTOM_FILTER_ICON[key] as IoniconName}
                  size={20}
                  tone="primary"
                />
              </View>
              <View className="flex-1">
                <AppText variant="bodyStrong">
                  {CUSTOM_FILTER_LABEL[key]}
                </AppText>
                <AppText variant="meta">{HELP[key]}</AppText>
              </View>
              <View
                className={`h-6 w-6 items-center justify-center rounded-full border ${
                  on ? "border-primary bg-primary" : "border-border"
                }`}
              >
                {on ? <Icon name="checkmark" size={14} tone="inverse" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
