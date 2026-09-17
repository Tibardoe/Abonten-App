import { ReportSheet } from "@/components/ReportSheet";
import { MediaStatusBar } from "@/components/app/MediaStatusBar";
import {
  type StoryQueueEntry,
  StoryViewer,
} from "@/components/content/StoryViewer";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

const ENTRY = /^(organizer|place|abonten):([0-9a-f-]{36})$/i;

// The Stories player opened from the row at the top of Messages:
// `?queue=organizer:<id>,place:<id>&start=1`. A screen (transparent, fading
// in over Messages) rather than a <Modal>, so replying can use the keyboard
// in the app's own window and a report sheet can open over the Story.
export default function StoryPlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ queue?: string; start?: string }>();
  const [reportFor, setReportFor] = useState<ContentPostDocument | null>(null);

  const queue = useMemo<StoryQueueEntry[]>(
    () =>
      (params.queue ?? "")
        .split(",")
        .map((part) => ENTRY.exec(part.trim()))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => ({
          publisherKind: m[1] as StoryQueueEntry["publisherKind"],
          publisherId: m[2],
        })),
    [params.queue],
  );
  const start = Math.min(
    Math.max(0, Number.parseInt(params.start ?? "0", 10) || 0),
    Math.max(0, queue.length - 1),
  );

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/messages");
  }, [router]);

  return (
    <View className="flex-1 bg-black">
      <MediaStatusBar />
      {queue.length > 0 ? (
        <StoryViewer
          queue={queue}
          startIndex={start}
          onClose={close}
          onReport={setReportFor}
        />
      ) : null}
      {reportFor ? (
        <ReportSheet
          open
          onClose={() => setReportFor(null)}
          targetType="story"
          targetId={reportFor.id}
          label={reportFor.caption?.slice(0, 80) || "Story"}
        />
      ) : null}
    </View>
  );
}
