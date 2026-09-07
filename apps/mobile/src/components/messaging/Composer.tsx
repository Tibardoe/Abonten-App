import {
  type StagedAttachment,
  pickChatImage,
  uploadChatAttachment,
} from "@/features/messaging/attachments";
import type { OutboxDraft } from "@/features/messaging/useMessageOutbox";
import { hapticLight } from "@/lib/haptics";
import type { MessageRow } from "@abonten/api-client";
import { MESSAGE_MAX_LENGTH } from "@abonten/types/messagingType";
import { AppText, Icon } from "@abonten/ui-native";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  View,
} from "react-native";

const MAX_ATTACHMENTS = 4;

export function Composer({
  conversationId,
  replyingTo,
  onCancelReply,
  onSend,
  onTyping,
  disabled,
  disabledReason,
}: {
  conversationId: string;
  replyingTo: MessageRow | null;
  onCancelReply: () => void;
  onSend: (draft: OutboxDraft) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const c = useThemeColors();
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const canSend =
    !disabled && !uploading && (text.trim().length > 0 || staged.length > 0);

  async function addImage() {
    if (staged.length >= MAX_ATTACHMENTS) return;
    try {
      const picked = await pickChatImage();
      if (picked) setStaged((prev) => [...prev, picked]);
    } catch (e) {
      Alert.alert(
        "Can't add photo",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  }

  async function handleSend() {
    if (!canSend) return;
    hapticLight();
    const body = text.trim();
    const toUpload = staged;

    // Clear the composer immediately — the message goes to the outbox.
    setText("");
    setStaged([]);
    onTyping(false);

    let attachments: OutboxDraft["attachments"] = [];
    const localPreviewUris = toUpload.map((s) => s.uri);
    if (toUpload.length > 0) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          toUpload.map((s) => uploadChatAttachment(conversationId, s)),
        );
      } catch {
        setUploading(false);
        // Put the user's work back so nothing is lost.
        setText(body);
        setStaged(toUpload);
        Alert.alert("Upload failed", "Your photo couldn't be uploaded.");
        return;
      }
      setUploading(false);
    }

    onSend({
      content: body.length > 0 ? body : null,
      replyToMessageId: replyingTo?.id ?? null,
      attachments,
      localPreviewUris,
    });
    onCancelReply();
  }

  if (disabled) {
    return (
      <View className="border-t border-border bg-card px-4 py-4">
        <AppText variant="meta" className="text-center">
          {disabledReason ?? "You can't send messages in this conversation."}
        </AppText>
      </View>
    );
  }

  return (
    <View className="border-t border-border bg-card">
      {replyingTo ? (
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
          <Icon name="arrow-undo-outline" size={15} tone="muted" />
          <View className="flex-1">
            <AppText variant="caption" className="font-semibold">
              Replying to
            </AppText>
            <AppText variant="caption" numberOfLines={1}>
              {replyingTo.deleted_at
                ? "Deleted message"
                : replyingTo.message_type === "image"
                  ? "Photo"
                  : (replyingTo.content ?? "Message")}
            </AppText>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Icon name="close" size={18} tone="muted" />
          </Pressable>
        </View>
      ) : null}

      {staged.length > 0 ? (
        <View className="flex-row gap-2 px-3 pt-2">
          {staged.map((s, i) => (
            <View key={s.uri} className="relative">
              <Image
                source={{ uri: s.uri }}
                style={{ width: 56, height: 56, borderRadius: 8 }}
                contentFit="cover"
              />
              <Pressable
                onPress={() =>
                  setStaged((prev) => prev.filter((_, idx) => idx !== i))
                }
                hitSlop={6}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-foreground"
              >
                <Icon name="close" size={12} tone="inverse" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-end gap-2 px-3 py-2">
        <Pressable
          onPress={addImage}
          hitSlop={8}
          disabled={staged.length >= MAX_ATTACHMENTS}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
          style={{ opacity: staged.length >= MAX_ATTACHMENTS ? 0.4 : 1 }}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
        >
          <Icon name="add-circle-outline" size={26} tone="muted" />
        </Pressable>

        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            onTyping(v.trim().length > 0);
          }}
          onBlur={() => onTyping(false)}
          placeholder="Message"
          placeholderTextColor={c["muted-foreground"]}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          className="max-h-28 flex-1 rounded-2xl border border-input bg-background px-3 py-2 text-[15px] text-foreground"
          style={family.body ? { fontFamily: family.body } : undefined}
        />

        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-80"
          style={{ opacity: canSend ? 1 : 0.4 }}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {uploading ? (
            <ActivityIndicator color={c["primary-foreground"]} size="small" />
          ) : (
            <Icon name="arrow-up" size={20} tone="inverse" />
          )}
        </Pressable>
      </View>
    </View>
  );
}
