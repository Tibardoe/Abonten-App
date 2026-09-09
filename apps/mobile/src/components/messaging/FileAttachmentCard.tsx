import { useAttachmentUrl } from "@/features/messaging/useAttachmentUrl";
import type { MessageRow } from "@abonten/api-client";
import { AppText, Icon, useToast } from "@abonten/ui-native";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Pressable, View } from "react-native";

type MessageAttachmentRow = MessageRow["attachments"][number];

function formatBytes(n: number | null): string | null {
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mime: string | null) {
  if (mime?.startsWith("video/")) return "videocam-outline" as const;
  if (mime === "application/pdf") return "document-text-outline" as const;
  return "document-outline" as const;
}

// A non-image attachment inside a bubble (a picked file, or a video sent as
// a file for now). Tap opens it via a short-lived signed URL in the system
// browser / viewer.
export function FileAttachmentCard({
  attachment,
  isMine,
}: {
  attachment: MessageAttachmentRow;
  isMine: boolean;
}) {
  const toast = useToast();
  const signed = useAttachmentUrl(attachment.storage_path);
  const size = formatBytes(attachment.file_size);

  async function open() {
    if (!signed.data) return;
    try {
      await WebBrowser.openBrowserAsync(signed.data);
    } catch {
      toast.error("Couldn't open", {
        description: "This file couldn't be opened.",
      });
    }
  }

  return (
    <Pressable
      onPress={open}
      disabled={!signed.data}
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.file_name ?? "file"}`}
      className="flex-row items-center gap-2.5 py-0.5"
      style={{ minWidth: 180 }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-lg"
        style={{
          backgroundColor: isMine ? "rgba(255,255,255,0.2)" : undefined,
        }}
      >
        {signed.isFetching && !signed.data ? (
          <ActivityIndicator size="small" />
        ) : (
          <Icon
            name={iconFor(attachment.mime_type)}
            size={20}
            tone={isMine ? "inverse" : "muted"}
          />
        )}
      </View>
      <View className="flex-1">
        <AppText
          variant="caption"
          numberOfLines={1}
          className={isMine ? "text-primary-foreground" : "text-foreground"}
        >
          {attachment.file_name ?? "Attachment"}
        </AppText>
        <AppText
          variant="caption"
          className={isMine ? "text-primary-foreground/70" : undefined}
        >
          {signed.isError ? "Unavailable" : (size ?? "Tap to open")}
        </AppText>
      </View>
    </Pressable>
  );
}
