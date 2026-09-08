import { AppText, Icon, type IoniconName, Sheet } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Pressable, View } from "react-native";

// The panel the composer's `+` opens (task §8) — a WhatsApp-style row of
// tinted icon tiles (Gallery · Camera · File) rather than a stacked text
// list. Built on the shared bottom sheet so it keeps the app's sheet
// chrome, safe-area handling and dismissal.

function Tile({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center gap-2 active:opacity-70"
    >
      <View
        className="items-center justify-center rounded-[22px]"
        style={{ width: 64, height: 64, backgroundColor: c.accent }}
      >
        <Icon name={icon} size={28} color={c.primary} />
      </View>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </Pressable>
  );
}

export function AttachmentSheet({
  open,
  onClose,
  onPickMedia,
  onCamera,
  onFile,
}: {
  open: boolean;
  onClose: () => void;
  onPickMedia: () => void;
  onCamera: () => void;
  onFile: () => void;
}) {
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add to message">
      <View className="flex-row gap-3 pb-2 pt-1">
        <Tile icon="images" label="Gallery" onPress={pick(onPickMedia)} />
        <Tile icon="camera" label="Camera" onPress={pick(onCamera)} />
        <Tile icon="document-text" label="File" onPress={pick(onFile)} />
      </View>
    </Sheet>
  );
}
