import {
  AttachmentPermissionError,
  type StagedAttachment,
  captureChatPhoto,
  pickChatDocument,
  pickChatMedia,
  uploadChatAttachment,
} from "@/features/messaging/attachments";
import { useAttachmentUrl } from "@/features/messaging/useAttachmentUrl";
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
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
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

function ReplyPreview({
  message,
  senderName,
  onCancel,
}: {
  message: MessageRow;
  senderName: string;
  onCancel: () => void;
}) {
  const att = message.attachments[0];
  const isImage = message.message_type === "image";
  const isAudio = message.message_type === "audio";
  const isVideo =
    message.message_type === "file" && !!att?.mime_type?.startsWith("video/");
  const isFile = message.message_type === "file";
  const dur = att?.duration_seconds ?? null;
  const durLabel =
    (isAudio || isVideo) && dur != null
      ? ` · ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}`
      : "";
  const thumb = useAttachmentUrl(isImage ? att?.storage_path : undefined);

  const line = message.deleted_at
    ? "Deleted message"
    : isImage
      ? "Photo"
      : isVideo
        ? `Video${durLabel}`
        : isAudio
          ? `Voice message${durLabel}`
          : isFile
            ? (att?.file_name ?? "Attachment")
            : (message.content ?? "Message");

  const glyph = isVideo ? "videocam" : isAudio ? "mic" : "document";

  return (
    <Animated.View
      entering={FadeInDown.duration(150)}
      exiting={FadeOutDown.duration(110)}
      className="px-3 pt-2"
    >
      <View className="flex-row items-stretch overflow-hidden rounded-xl bg-accent">
        <View className="w-1 bg-primary" />
        <View className="flex-1 justify-center gap-[3px] py-2 pl-2.5 pr-1">
          <AppText
            numberOfLines={1}
            className="text-[13px] font-semibold leading-[16px] text-primary"
          >
            Replying to {senderName}
          </AppText>
          <AppText
            variant="meta"
            numberOfLines={1}
            className="text-[13px] leading-[17px] opacity-80"
          >
            {line}
          </AppText>
        </View>
        {isImage && thumb.data ? (
          <Image
            source={{ uri: thumb.data }}
            style={{ width: 44 }}
            contentFit="cover"
          />
        ) : isImage || isAudio || isFile ? (
          <View className="w-11 items-center justify-center bg-muted">
            <Icon name={isImage ? "image" : glyph} size={18} tone="muted" />
          </View>
        ) : null}
        <Pressable
          onPress={onCancel}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel reply"
          className="w-10 items-center justify-center active:opacity-60"
        >
          <Icon name="close" size={18} tone="muted" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function Composer({
  conversationId,
  replyingTo,
  replyingToName,
  onCancelReply,
  onSend,
  onTyping,
  disabled,
  disabledReason,
}: {
  conversationId: string;
  replyingTo: MessageRow | null;
  replyingToName?: string;
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
      // A message with NO attachment is "text". This chain previously fell
      // through to "file" for a plain typed message, so every text message
      // sent from mobile was stored as message_type='file' with zero
      // attachments — which silently disabled emoji-only rendering and the
      // Copy action (both gated on "text"), and made reply previews of a
      // text message read "Attachment".
      messageType: anyAudio
        ? "audio"
        : anyImage
          ? "image"
          : toUpload.length > 0
            ? "file"
            : "text",
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
      className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
      style={{ opacity: canSend ? 1 : 0.4 }}
      accessibilityRole="button"
      accessibilityLabel="Send message"
    >
      {uploading ? (
        <ActivityIndicator color={c["primary-foreground"]} size="small" />
      ) : (
        <Icon name="arrow-up" size={21} tone="inverse" />
      )}
    </Pressable>
  ) : VOICE_SUPPORTED ? (
    <Suspense
      fallback={
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary opacity-60">
          <Icon name="mic" size={20} tone="inverse" />
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
      className="h-10 w-10 items-center justify-center rounded-full bg-primary opacity-40"
      accessibilityRole="button"
      accessibilityLabel="Send message"
    >
      <Icon name="arrow-up" size={21} tone="inverse" />
    </View>
  );

  return (
    <BottomBar
      className="border-t border-border bg-card"
      minInset={8}
      keyboardInset={4}
    >
      {replyingTo ? (
        <ReplyPreview
          message={replyingTo}
          senderName={replyingToName ?? "message"}
          onCancel={onCancelReply}
        />
      ) : null}

      {staged.length > 0 ? (
        <View className="flex-row flex-wrap gap-2.5 px-3 pt-2.5">
          {staged.map((s, i) => (
            <View key={s.uri} className="relative">
              {s.kind === "image" ? (
                <Image
                  source={{ uri: s.uri }}
                  style={{ width: 62, height: 62, borderRadius: 12 }}
                  contentFit="cover"
                />
              ) : (
                <View
                  className="items-center justify-center rounded-xl bg-muted"
                  style={{ width: 62, height: 62 }}
                >
                  <Icon
                    name={s.kind === "video" ? "videocam" : "document-text"}
                    size={22}
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
                className="absolute -right-2 -top-2 h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-card bg-foreground"
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
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          style={{ opacity: staged.length >= MAX_ATTACHMENTS ? 0.4 : 1 }}
          accessibilityRole="button"
          accessibilityLabel="Add attachment"
        >
          <Icon name="add" size={26} tone="muted" />
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
          className="max-h-28 flex-1 rounded-[22px] border border-input bg-background px-4 py-2.5 text-[16px] text-foreground"
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
