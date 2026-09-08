import type { StagedAttachment } from "@/features/messaging/attachments";
import { AppText, Icon, Sheet } from "@abonten/ui-native";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

// The "confirm before sending" step for a single picked item (task §9) —
// camera shots, files, and a single gallery photo. Modelled on WhatsApp's
// photo-caption screen: a large rounded preview, then a rounded caption
// field with an inline circular send button. A multi-photo gallery pick
// skips this and stages in the composer strip instead.

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPreview({
  attachment,
  sending,
  onCancel,
  onConfirm,
}: {
  attachment: StagedAttachment | null;
  sending: boolean;
  onCancel: () => void;
  onConfirm: (caption: string) => void;
}) {
  const c = useThemeColors();
  const [caption, setCaption] = useState("");

  useEffect(() => {
    if (!attachment) setCaption("");
  }, [attachment]);

  return (
    <Sheet
      open={!!attachment}
      onClose={sending ? () => {} : onCancel}
      title="Send attachment"
      maxHeightRatio={0.82}
      footer={
        <View className="flex-row items-end gap-2">
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption…"
            placeholderTextColor={c["muted-foreground"]}
            multiline
            editable={!sending}
            maxLength={1000}
            className="max-h-24 flex-1 rounded-[22px] border border-input bg-background px-4 py-2.5 text-[16px] text-foreground"
            style={family.body ? { fontFamily: family.body } : undefined}
          />
          <Pressable
            onPress={() => onConfirm(caption.trim())}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Send attachment"
            className="h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-80"
            style={{ opacity: sending ? 0.6 : 1 }}
          >
            {sending ? (
              <ActivityIndicator color={c["primary-foreground"]} size="small" />
            ) : (
              <Icon name="arrow-up" size={22} tone="inverse" />
            )}
          </Pressable>
        </View>
      }
    >
      {attachment ? (
        <View className="gap-3">
          {attachment.kind === "image" ? (
            <Image
              source={{ uri: attachment.uri }}
              style={{ width: "100%", height: 300, borderRadius: 18 }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-card p-4">
              <View
                className="items-center justify-center rounded-2xl"
                style={{ width: 52, height: 52, backgroundColor: c.accent }}
              >
                <Icon
                  name={
                    attachment.kind === "video"
                      ? "videocam"
                      : attachment.kind === "audio"
                        ? "musical-notes"
                        : "document-text"
                  }
                  size={26}
                  color={c.primary}
                />
              </View>
              <View className="flex-1">
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {attachment.fileName ?? "Attachment"}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {attachment.kind === "video"
                    ? "Video"
                    : attachment.kind === "audio"
                      ? "Audio"
                      : "File"}
                  {attachment.fileSize
                    ? ` · ${formatBytes(attachment.fileSize)}`
                    : ""}
                </AppText>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}
