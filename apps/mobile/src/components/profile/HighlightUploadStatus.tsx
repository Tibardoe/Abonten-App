import { useHighlightUpload } from "@/features/profile/HighlightUploadProvider";
import { AppText, Icon } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// Compact banner for an in-flight / failed highlight upload, shown on the
// highlights row after the compose screen hands off and closes. Native echo
// of the web `HighlightUploadStatus`.

export function HighlightUploadStatus() {
  const { status, progress, count, error, retry, dismiss } =
    useHighlightUpload();

  if (status === "idle") return null;

  const pct = Math.round(progress * 100);
  const label = count === 1 ? "1 item" : `${count} items`;

  if (status === "success") {
    return (
      <View className="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Icon name="checkmark-circle" size={16} tone="primary" />
        <AppText className="text-[13px] text-foreground">
          Highlight posted
        </AppText>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View className="mb-2 gap-2 rounded-xl border border-destructive/40 bg-card px-3 py-2.5">
        <View className="flex-row items-center gap-2">
          <Icon name="alert-circle" size={16} tone="destructive" />
          <AppText className="flex-1 text-[13px] text-foreground">
            {error ?? "Couldn't post your highlight."}
          </AppText>
        </View>
        <View className="flex-row gap-3">
          <Pressable onPress={retry} hitSlop={6}>
            <AppText className="text-[13px] font-semibold text-primary">
              Retry
            </AppText>
          </Pressable>
          <Pressable onPress={dismiss} hitSlop={6}>
            <AppText className="text-[13px] font-semibold text-muted-foreground">
              Dismiss
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  // uploading
  return (
    <View className="mb-2 gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
      <View className="flex-row items-center justify-between">
        <AppText className="text-[13px] text-foreground">
          Posting highlight ({label})
        </AppText>
        <AppText className="text-[12px] text-muted-foreground">{pct}%</AppText>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </View>
    </View>
  );
}
