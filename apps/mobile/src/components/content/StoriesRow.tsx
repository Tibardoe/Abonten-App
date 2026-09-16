import { useSession } from "@/auth/SessionProvider";
import { ReportSheet } from "@/components/ReportSheet";
import { publisherLabel } from "@/features/content/contentLinks";
import { useStoryTray } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { YOUR_STORY_LABEL } from "@abonten/core/content/copy";
import type {
  ContentPostDocument,
  StoryTrayEntry,
} from "@abonten/types/contentType";
import {
  AppText,
  Avatar,
  Icon,
  runAfterModalDismissal,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ContentCommentsSheet } from "./ContentCommentsSheet";
import { type StoryQueueEntry, StoryViewer } from "./StoryViewer";

// The Stories row at the top of Messages: "Your Story" first when you can
// post, then the organizers and places you follow with unseen Stories
// first. Renders nothing while Stories is off for this person.
export function StoriesRow() {
  const router = useRouter();
  const { session } = useSession();
  const { program } = useContentProgram();
  const tray = useStoryTray(program.stories);
  const [open, setOpen] = useState<{
    queue: StoryQueueEntry[];
    start: number;
  } | null>(null);
  const [commentsFor, setCommentsFor] = useState<ContentPostDocument | null>(
    null,
  );
  const [reportFor, setReportFor] = useState<ContentPostDocument | null>(null);

  if (!program.stories || !session) return null;

  const entries = tray.data?.entries ?? [];
  const self = entries.find((e) => e.isSelf) ?? null;
  const others = entries.filter((e) => !e.isSelf && !e.muted);
  const canPublish = !!tray.data?.canPublish && program.storiesPosting;

  if (tray.isLoading) {
    return (
      <View className="flex-row gap-3 px-4 py-3">
        {Array.from({ length: 5 }, (_, i) => (
          <View
            key={`s-${i.toString()}`}
            className="h-14 w-14 rounded-full bg-muted"
          />
        ))}
      </View>
    );
  }
  if (!self && others.length === 0 && !canPublish) return null;

  const queue = others.map((e) => ({
    publisherKind: e.publisher.kind,
    publisherId: e.publisher.id,
  }));

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-4 py-3"
        accessibilityLabel="Stories"
      >
        {self ? (
          <Bubble
            entry={self}
            label={YOUR_STORY_LABEL}
            onPress={() =>
              setOpen({
                queue: [
                  {
                    publisherKind: self.publisher.kind,
                    publisherId: self.publisher.id,
                  },
                ],
                start: 0,
              })
            }
            onAdd={
              canPublish
                ? () => router.push("/(app)/spotlight/new?kind=story")
                : undefined
            }
          />
        ) : canPublish ? (
          <Pressable
            onPress={() => router.push("/(app)/spotlight/new?kind=story")}
            accessibilityRole="button"
            accessibilityLabel="Add to your Story"
            className="w-16 items-center gap-1"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted">
              <Icon name="add" size={24} tone="muted" />
            </View>
            <AppText variant="caption" numberOfLines={1}>
              {YOUR_STORY_LABEL}
            </AppText>
          </Pressable>
        ) : null}
        {others.map((entry, i) => (
          <Bubble
            key={`${entry.publisher.kind}:${entry.publisher.id}`}
            entry={entry}
            label={publisherLabel(entry.publisher)}
            onPress={() => setOpen({ queue, start: i })}
          />
        ))}
      </ScrollView>

      {open ? (
        <StoryViewer
          queue={open.queue}
          startIndex={open.start}
          onClose={() => setOpen(null)}
          onOpenComments={(story) => {
            setOpen(null);
            runAfterModalDismissal(() => setCommentsFor(story));
          }}
          onReport={(story) => {
            setOpen(null);
            runAfterModalDismissal(() => setReportFor(story));
          }}
        />
      ) : null}
      {commentsFor ? (
        <ContentCommentsSheet
          postId={commentsFor.id}
          open
          onClose={() => setCommentsFor(null)}
          commentsAllowed
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
    </>
  );
}

function Bubble({
  entry,
  label,
  onPress,
  onAdd,
}: {
  entry: StoryTrayEntry;
  label: string;
  onPress: () => void;
  onAdd?: () => void;
}) {
  return (
    <View className="w-16 items-center gap-1">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} Stories${entry.hasUnseen ? ", new" : ""}`}
        className={[
          "rounded-full p-[2px]",
          entry.hasUnseen ? "bg-primary" : "bg-border",
        ].join(" ")}
      >
        <View className="rounded-full bg-background p-[2px]">
          <Avatar
            publicId={entry.publisher.avatarPublicId}
            version={entry.publisher.avatarVersion}
            size={48}
          />
        </View>
      </Pressable>
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Add to your Story"
          style={{ position: "absolute", right: 2, top: 38 }}
          className="h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary"
        >
          <Icon name="add" size={12} tone="inverse" />
        </Pressable>
      ) : null}
      <AppText
        variant="caption"
        numberOfLines={1}
        tone={entry.hasUnseen ? undefined : "muted"}
        className={entry.hasUnseen ? "font-semibold" : undefined}
      >
        {label}
      </AppText>
    </View>
  );
}
