import {
  AttachmentPermissionError,
  type StagedAttachment,
  captureChatPhoto,
  pickChatDocument,
  pickChatMedia,
  uploadChatAttachment,
} from "@/features/messaging/attachments";
import type {
  OutboxDraft,
  OutboxMessageType,
} from "@/features/messaging/useMessageOutbox";
import { VOICE_SUPPORTED } from "@/features/messaging/voiceSupport";
import { hapticLight } from "@/lib/haptics";
import type { MessageRow } from "@abonten/api-client";
import { MESSAGE_MAX_LENGTH } from "@abonten/types/messagingType";
import { AppText, BottomBar, Icon } from "@abonten/ui-native";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { Suspense, lazy, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { AttachmentPreview } from "./AttachmentPreview";
import { AttachmentSheet } from "./AttachmentSheet";
import type VoiceComposerComponent from "./VoiceComposer";

// Loaded only when the native audio module is present — `./VoiceComposer`
// (via features/messaging/voice.ts) is the one part of the composer that
// imports `expo-audio`, which throws at import in a prebuild app that hasn't
// been rebuilt since the dependency was added. A `require` inside the lazy
// factory is deferred until the component actually renders (never, when
// VOICE_SUPPORTED is false), regardless of the bundler's import() semantics.
// `import type` above is erased at compile time — no runtime import.
const LazyVoiceComposer = lazy(async () => ({
  default: (
    require("./VoiceComposer") as { default: typeof VoiceComposerComponent }
  ).default,
}));

const MAX_ATTACHMENTS = 4;

function kindToType(kind: StagedAttachment["kind"]): OutboxMessageType {
  if (kind === "image") return "image";
  if (kind === "audio") return "audio";
  return "file"; // video is sent as a file for now
}

function reportAttachmentError(e: unknown, fallbackTitle: string) {
  if (e instanceof AttachmentPermissionError) {
    Alert.alert("Permission needed", e.message, [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ]);
    return;
  }
  Alert.alert(
    fallbackTitle,
    e instanceof Error ? e.message : "Please try again.",
  );
}

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preview, setPreview] = useState<StagedAttachment | null>(null);
  const [previewSending, setPreviewSending] = useState(false);

  const hasContent = text.trim().length > 0 || staged.length > 0;
  const canSend = !disabled && !uploading && hasContent;

  // ── attachment pickers ────────────────────────────────────────────
  async function onPickMedia() {
    try {
      const room = MAX_ATTACHMENTS - staged.length;
      if (room <= 0) return;
      const items = await pickChatMedia(room);
      if (items.length === 0) return;
      if (items.length === 1) setPreview(items[0]);
      else setStaged((prev) => [...prev, ...items].slice(0, MAX_ATTACHMENTS));
    } catch (e) {
      reportAttachmentError(e, "Can't add media");
    }
  }

  async function onCamera() {
    try {
      const shot = await captureChatPhoto();
      if (shot) setPreview(shot);
    } catch (e) {
      reportAttachmentError(e, "Can't open the camera");
    }
  }

  async function onFile() {
    try {
      const doc = await pickChatDocument();
      if (doc) setPreview(doc);
    } catch (e) {
      reportAttachmentError(e, "Can't add file");
    }
  }

  // ── send text + staged strip ───────────────────────────────────────
  async function handleSend() {
    if (!canSend) return;
    hapticLight();
    const body = text.trim();
    const toUpload = staged;

    setText("");
    setStaged([]);
    onTyping(false);

    let attachments: OutboxDraft["attachments"] = [];
    const localPreviewUris = toUpload
      .filter((s) => s.kind === "image")
      .map((s) => s.uri);
    if (toUpload.length > 0) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          toUpload.map((s) => uploadChatAttachment(conversationId, s)),
        );
      } catch (e) {
        setUploading(false);
        setText(body);
        setStaged(toUpload);
        Alert.alert(
          "Upload failed",
          e instanceof Error ? e.message : "Your attachment couldn't be sent.",
        );
        return;
      }
      setUploading(false);
    }

    const anyAudio = toUpload.some((s) => s.kind === "audio");
    const anyImage = toUpload.some((s) => s.kind === "image");
    onSend({
      content: body.length > 0 ? body : null,
      replyToMessageId: replyingTo?.id ?? null,
      attachments,
      localPreviewUris,
      messageType: anyAudio ? "audio" : anyImage ? "image" : "file",
    });
    onCancelReply();
  }

  // ── attachment preview -> send ─────────────────────────────────────
  async function confirmPreview(caption: string) {
    if (!preview) return;
    setPreviewSending(true);
    try {
      const descriptor = await uploadChatAttachment(conversationId, preview);
      onSend({
        content: caption.length > 0 ? caption : null,
        replyToMessageId: replyingTo?.id ?? null,
        attachments: [descriptor],
        localPreviewUris: preview.kind === "image" ? [preview.uri] : [],
        messageType: kindToType(preview.kind),
      });
      onCancelReply();
      setPreview(null);
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setPreviewSending(false);
    }
  }

  if (disabled) {
    return (
      <BottomBar className="border-t border-border bg-card px-4 pt-4">
        <AppText variant="meta" className="text-center">
          {disabledReason ?? "You can't send messages in this conversation."}
        </AppText>
      </BottomBar>
    );
  }

  const trailingButton = hasContent ? (
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
  ) : VOICE_SUPPORTED ? (
    <Suspense
      fallback={
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary opacity-60">
          <Icon name="mic" size={19} tone="inverse" />
        </View>
      }
    >
      <LazyVoiceComposer
        conversationId={conversationId}
        replyingTo={replyingTo}
        onSend={onSend}
        onCancelReply={onCancelReply}
      />
    </Suspense>
  ) : (
    <View
      className="h-9 w-9 items-center justify-center rounded-full bg-primary opacity-40"
      accessibilityRole="button"
      accessibilityLabel="Send message"
    >
      <Icon name="arrow-up" size={20} tone="inverse" />
    </View>
  );

  return (
    <BottomBar
      className="border-t border-border bg-card"
      minInset={8}
      keyboardInset={4}
    >
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
                  : replyingTo.message_type === "audio"
                    ? "Voice message"
                    : (replyingTo.content ?? "Message")}
            </AppText>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Icon name="close" size={18} tone="muted" />
          </Pressable>
        </View>
      ) : null}

      {staged.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 px-3 pt-2">
          {staged.map((s, i) => (
            <View key={s.uri} className="relative">
              {s.kind === "image" ? (
                <Image
                  source={{ uri: s.uri }}
                  style={{ width: 56, height: 56, borderRadius: 8 }}
                  contentFit="cover"
                />
              ) : (
                <View className="h-14 w-14 items-center justify-center rounded-lg bg-muted">
                  <Icon
                    name={
                      s.kind === "video"
                        ? "videocam-outline"
                        : "document-outline"
                    }
                    size={20}
                    tone="muted"
                  />
                </View>
              )}
              <Pressable
                onPress={() =>
                  setStaged((prev) => prev.filter((_, idx) => idx !== i))
                }
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Remove attachment"
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
          onPress={() => setSheetOpen(true)}
          hitSlop={8}
          disabled={staged.length >= MAX_ATTACHMENTS}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
          style={{ opacity: staged.length >= MAX_ATTACHMENTS ? 0.4 : 1 }}
          accessibilityRole="button"
          accessibilityLabel="Add attachment"
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

        {trailingButton}
      </View>

      <AttachmentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPickMedia={onPickMedia}
        onCamera={onCamera}
        onFile={onFile}
      />
      <AttachmentPreview
        attachment={preview}
        sending={previewSending}
        onCancel={() => setPreview(null)}
        onConfirm={confirmPreview}
      />
    </BottomBar>
  );
}
