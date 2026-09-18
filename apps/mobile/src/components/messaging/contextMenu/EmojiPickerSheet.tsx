import { firstEmojiCluster } from "@/features/messaging/emojiOnly";
import { hapticSelection } from "@/lib/haptics";
import { isValidReactionEmoji } from "@abonten/core/messagingReactions";
import { AppText, Input, Sheet } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

// "React with any emoji": the "+" on the reaction bar opens this, which puts
// the caret in a field and raises the SYSTEM keyboard so the user can switch
// to its emoji panel and tap one. Deliberately not a bundled emoji grid — the
// OS keyboard already has every emoji, correct for the device's Unicode
// version, with skin-tone and search built in, and needs no catalogue to ship
// or maintain.
//
// It is the app's <Sheet>, not its own RN <Modal>: a sheet hugging its content
// lifts with the keyboard on the UI thread (the Modal + KeyboardAvoidingView
// it replaced did nothing on Android and jumped on iOS), and the caller opens
// it only after the message action overlay has dismissed, so there is never
// a Modal window for it to be hidden under.
//
// The first emoji typed is taken and confirmed immediately, so it feels like
// picking rather than typing. Anything that isn't a single valid reaction is
// rejected by isValidReactionEmoji (the same rule the API and the
// message_reaction_emoji_shape CHECK enforce), so a pasted sentence can't get
// through.

export function EmojiPickerSheet({
  open,
  recents,
  onPick,
  onClose,
}: {
  open: boolean;
  /** Previously picked emoji, offered as one-tap shortcuts. */
  recents: string[];
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const [value, setValue] = useState("");
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (open) return;
    setValue("");
    setRejected(false);
  }, [open]);

  function confirm(emoji: string) {
    hapticSelection();
    onPick(emoji);
    onClose();
  }

  function handleChange(next: string) {
    setValue(next);
    if (!next) {
      setRejected(false);
      return;
    }
    const cluster = firstEmojiCluster(next);
    if (cluster && isValidReactionEmoji(cluster)) {
      confirm(cluster);
      return;
    }
    // Typed a letter/number: say so rather than silently swallowing it.
    setRejected(true);
  }

  return (
    <Sheet open={open} onClose={onClose} title="React with any emoji">
      <AppText variant="meta" tone="muted" className="text-[13px]">
        Switch your keyboard to emoji and tap one.
      </AppText>

      {recents.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
          {recents.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`React ${e}`}
              onPress={() => confirm(e)}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
                backgroundColor: pressed ? c.accent : c.muted,
              })}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* The shared <Input> tells the sheet it holds a field, so the sheet
          opens with room above the keyboard that autoFocus raises at once. */}
      <Input
        value={value}
        onChangeText={handleChange}
        autoFocus
        invalid={rejected}
        // A short field reads as "one emoji", not a message composer.
        maxLength={16}
        placeholder="🙂"
        accessibilityLabel="Type or pick an emoji"
        className="mt-3.5 h-[52px] rounded-[14px] text-center text-[26px]"
      />

      {rejected ? (
        <AppText variant="caption" tone="error" className="mt-2 text-center">
          That isn't an emoji — try the emoji panel on your keyboard.
        </AppText>
      ) : null}
    </Sheet>
  );
}
