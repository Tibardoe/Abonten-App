import type { StagedAttachment } from "@/features/messaging/attachments";
import { AppText, Button, Icon, Sheet } from "@abonten/ui-native";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";

// The "confirm before sending" step for a single picked item (task §9) —
// camera shots, files, and a single gallery photo. A multi-photo gallery
// pick skips this and stages in the composer strip instead.

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
      maxHeightRatio={0.8}
      footer={
        <Button
          title={sending ? "Sending…" : "Send"}
          fullWidth
          loading={sending}
          onPress={() => onConfirm(caption.trim())}
        />
      }
    >
      {attachment ? (
        <View className="gap-3">
          {attachment.kind === "image" ? (
            <Image
              source={{ uri: attachment.uri }}
              style={{ width: "100%", height: 260, borderRadius: 12 }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Icon
                name={
                  attachment.kind === "video"
                    ? "videocam-outline"
                    : attachment.kind === "audio"
                      ? "musical-notes-outline"
                      : "document-outline"
                }
                size={26}
                tone="muted"
              />
              <View className="flex-1">
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {attachment.fileName ?? "Attachment"}
                </AppText>
                <AppText variant="caption">
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

          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption…"
            placeholderTextColor={c["muted-foreground"]}
            multiline
            editable={!sending}
            maxLength={1000}
            className="min-h-12 rounded-lg border border-input bg-background p-3 text-[15px] text-foreground"
            style={family.body ? { fontFamily: family.body } : undefined}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
