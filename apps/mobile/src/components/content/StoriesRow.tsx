import { useSession } from "@/auth/SessionProvider";
import { publisherLabel } from "@/features/content/contentLinks";
import { useStoryTray } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { hapticSelection } from "@/lib/haptics";
import { YOUR_STORY_LABEL } from "@abonten/core/content/copy";
import type { StoryTrayEntry } from "@abonten/types/contentType";
import { AppText, Avatar, Icon, Skeleton } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, ScrollView, View } from "react-native";

// Ring geometry. The avatar is the photo; the ring is a coloured band
// around it with a thin gap of the page colour between, so an unseen ring
// reads clearly without eating into the face.
const AVATAR = 62;
const RING = 2.5;
const GAP = 2.5;
const BUBBLE = AVATAR + 2 * (RING + GAP);
const ITEM_WIDTH = 76;

// The Stories row at the top of Messages: "Your Story" first when you can
// post, then the organizers and places you follow with unseen Stories
// first. Renders nothing while Stories is off for this person. Opening a
// bubble pushes the Stories player (story/play) with the whole row queued,
// so the viewer moves on to the next publisher by itself.
export function StoriesRow() {
  const router = useRouter();
  const { session } = useSession();
  const { program } = useContentProgram();
  const tray = useStoryTray(program.stories);

  if (!program.stories || !session) return null;

  const entries = tray.data?.entries ?? [];
  const self = entries.find((e) => e.isSelf) ?? null;
  const others = entries.filter((e) => !e.isSelf && !e.muted);
  const canPublish = !!tray.data?.canPublish && program.storiesPosting;

  if (tray.isLoading) {
    return (
      <View
        className="flex-row gap-2 border-b border-border px-3 pb-3 pt-2"
        accessibilityLabel="Loading Stories"
      >
        {Array.from({ length: 5 }, (_, i) => (
          <View
            key={`s-${i.toString()}`}
            className="items-center gap-1.5"
            style={{ width: ITEM_WIDTH }}
          >
            <Skeleton width={BUBBLE} height={BUBBLE} radius={BUBBLE / 2} />
            <Skeleton width={48} height={10} radius={4} />
          </View>
        ))}
      </View>
    );
  }
  if (!self && others.length === 0 && !canPublish) return null;

  const openQueue = (list: StoryTrayEntry[], start: number) => {
    hapticSelection();
    const queue = list
      .map((e) => `${e.publisher.kind}:${e.publisher.id}`)
      .join(",");
    router.push(
      `/(app)/story/play?queue=${encodeURIComponent(queue)}&start=${start}` as never,
    );
  };
  const compose = () => router.push("/(app)/spotlight/new?kind=story");

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="grow-0 border-b border-border"
      contentContainerClassName="gap-2 px-3 pb-3 pt-2"
      accessibilityLabel="Stories"
    >
      {self ? (
        <Bubble
          entry={self}
          label={YOUR_STORY_LABEL}
          onPress={() => openQueue([self], 0)}
          onAdd={canPublish ? compose : undefined}
        />
      ) : canPublish ? (
        <Pressable
          onPress={compose}
          accessibilityRole="button"
          accessibilityLabel="Add to your Story"
          className="items-center gap-1.5 active:opacity-70"
          style={{ width: ITEM_WIDTH }}
        >
          <View
            className="items-center justify-center rounded-full border-2 border-dashed border-border bg-muted"
            style={{ width: BUBBLE, height: BUBBLE }}
          >
            <Icon name="add" size={28} tone="muted" />
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
          onPress={() => openQueue(others, i)}
        />
      ))}
    </ScrollView>
  );
}

const Bubble = memo(function Bubble({
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
    <View className="items-center gap-1.5" style={{ width: ITEM_WIDTH }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} Stories${entry.hasUnseen ? ", new" : ", seen"}`}
        className={[
          "items-center justify-center rounded-full active:opacity-80",
          entry.hasUnseen ? "bg-primary" : "bg-border",
        ].join(" ")}
        style={{ width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2 }}
      >
        {/* Seen rings are thinner; the avatar stays the same size. */}
        <View
          className="items-center justify-center bg-background"
          style={{
            width: BUBBLE - 2 * (entry.hasUnseen ? RING : RING - 1),
            height: BUBBLE - 2 * (entry.hasUnseen ? RING : RING - 1),
            borderRadius: BUBBLE / 2,
          }}
        >
          <Avatar
            publicId={entry.publisher.avatarPublicId}
            version={entry.publisher.avatarVersion}
            size={AVATAR}
          />
        </View>
      </Pressable>
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add to your Story"
          style={{ position: "absolute", right: 4, top: BUBBLE - 22 }}
          className="h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary"
        >
          <Icon name="add" size={14} tone="inverse" />
        </Pressable>
      ) : null}
      <AppText
        variant="caption"
        numberOfLines={1}
        tone={entry.hasUnseen ? undefined : "muted"}
        className={[
          "text-center text-[12px]",
          entry.hasUnseen ? "font-semibold" : "",
        ].join(" ")}
      >
        {label}
      </AppText>
    </View>
  );
});
