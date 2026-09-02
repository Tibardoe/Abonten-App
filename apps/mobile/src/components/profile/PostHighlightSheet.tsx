import {
  type HighlightMediaPick,
  useUploadHighlights,
} from "@/features/profile/useHighlights";
import { AppText, Button, Icon, Sheet } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

// The "post a highlight" review step. After the user picks media in
// HighlightsRow this sheet shows exactly what will be posted, then Post runs
// the real upload with a live progress bar (driven by
// useUploadHighlights({ onProgress })). A failure keeps the sheet open with
// a Retry; the sheet can't be dismissed mid-upload, and Post is inert while
// a run is in flight, so a batch can't be submitted twice.

const noop = () => {};

export function PostHighlightSheet({
  open,
  media,
  userId,
  onClose,
  onPosted,
}: {
  open: boolean;
  media: HighlightMediaPick[];
  userId: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadHighlights(userId, { onProgress: setProgress });
  const uploading = upload.isPending;

  useEffect(() => {
    if (open) {
      setProgress(0);
      setError(null);
    }
  }, [open]);

  function post() {
    if (uploading) return; // guard against a double tap
    setError(null);
    setProgress(0);
    upload.mutate(media, {
      onSuccess: () => onPosted(),
      onError: (e) =>
        setError(
          e instanceof Error ? e.message : "Upload failed. Please try again.",
        ),
    });
  }

  const pct = Math.round(progress * 100);

  return (
    <Sheet
      open={open}
      onClose={uploading ? noop : onClose}
      title="New highlight"
    >
      <View className="gap-4">
        <AppText variant="muted">
          {media.length === 1 ? "1 item" : `${media.length} items`} will be
          added to your highlights.
        </AppText>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {media.map((m, i) => (
            <View
              key={`${m.uri}-${i}`}
              className="h-40 w-28 overflow-hidden rounded-lg border border-border bg-muted"
            >
              {m.type === "image" ? (
                <Image
                  source={{ uri: m.uri }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <View className="flex-1 items-center justify-center gap-1">
                  <Icon name="videocam" size={22} tone="muted" />
                  <AppText className="text-[11px] text-muted-foreground">
                    Video
                  </AppText>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {uploading ? (
          <View className="gap-1.5">
            <View className="h-2 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </View>
            <AppText variant="caption">Uploading… {pct}%</AppText>
          </View>
        ) : null}

        {error ? (
          <AppText className="text-[13px] text-destructive">{error}</AppText>
        ) : null}

        <View className="gap-2">
          <Button
            title={
              error
                ? "Retry"
                : uploading
                  ? `Posting… ${pct}%`
                  : "Post highlight"
            }
            fullWidth
            loading={uploading}
            onPress={post}
          />
          {!uploading ? (
            <Button
              title="Cancel"
              variant="outline"
              fullWidth
              onPress={onClose}
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
