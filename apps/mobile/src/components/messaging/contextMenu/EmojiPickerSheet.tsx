import { firstEmojiCluster } from "@/features/messaging/emojiOnly";
import { hapticSelection } from "@/lib/haptics";
import { isValidReactionEmoji } from "@abonten/core/messagingReactions";
import { AppText } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// "React with any emoji": the "+" on the reaction bar opens this, which puts
// the caret in a field and raises the SYSTEM keyboard so the user can switch
// to its emoji panel and tap one. Deliberately not a bundled emoji grid — the
// OS keyboard already has every emoji, correct for the device's Unicode
// version, with skin-tone and search built in, and needs no catalogue to ship
// or maintain.
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
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue("");
      setRejected(false);
      return;
    }
    // Give the modal a frame to mount before asking for the keyboard,
    // otherwise Android sometimes drops the focus request.
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
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

  if (!open) return null;

  return (
    <Modal
      transparent
      visible={open}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(120)}
        exiting={FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close emoji picker"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
        pointerEvents="box-none"
      >
        <Animated.View
          entering={SlideInDown.duration(180)}
          style={{
            backgroundColor: c.popover,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 18,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <AppText variant="bodyStrong" className="text-[16px]">
            React with any emoji
          </AppText>
          <AppText variant="meta" tone="muted" className="mt-1 text-[13px]">
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

          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={handleChange}
            autoFocus
            // A short field reads as "one emoji", not a message composer.
            maxLength={16}
            placeholder="🙂"
            placeholderTextColor={c["muted-foreground"]}
            accessibilityLabel="Type or pick an emoji"
            style={{
              marginTop: 14,
              height: 52,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: rejected ? c.destructive : c.border,
              backgroundColor: c.background,
              color: c.foreground,
              textAlign: "center",
              fontSize: 26,
            }}
          />

          {rejected ? (
            <AppText
              variant="caption"
              tone="error"
              className="mt-2 text-center"
            >
              That isn't an emoji — try the emoji panel on your keyboard.
            </AppText>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
