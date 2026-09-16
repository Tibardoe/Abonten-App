import { usePublisherSpotlights } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { AppText, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

// A publisher's recent Spotlights as a horizontal strip (profile, place).
// Hidden while Spotlight is off for this person or when there is nothing.
export function PublisherSpotlightStrip({
  publisherKind,
  publisherId,
  className,
}: {
  publisherKind: "organizer" | "place";
  publisherId: string | undefined;
  className?: string;
}) {
  const router = useRouter();
  const { program } = useContentProgram();
  const q = usePublisherSpotlights(
    publisherKind,
    publisherId,
    program.spotlight,
  );
  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];

  if (!program.spotlight || posts.length === 0) return null;

  return (
    <View className={["gap-2", className ?? ""].join(" ")}>
      <AppText variant="sectionHeading" className="px-4">
        Spotlight
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4"
      >
        {posts.map((post) => {
          const m = post.media[0];
          const thumb =
            m?.type === "video"
              ? (m.thumbnailUrl ?? m.posterUrl)
              : (m?.thumbnailUrl ?? m?.mediaUrl);
          return (
            <Pressable
              key={post.id}
              onPress={() => router.push(`/(app)/spotlight/${post.id}`)}
              accessibilityRole="button"
              accessibilityLabel={post.caption?.slice(0, 80) || "Spotlight"}
              className="h-44 w-28 overflow-hidden rounded-xl bg-muted"
            >
              {thumb ? (
                <Image
                  source={{ uri: thumb }}
                  style={{ flex: 1 }}
                  contentFit="cover"
                />
              ) : null}
              <View
                style={{ position: "absolute", left: 6, bottom: 6 }}
                className="flex-row items-center gap-0.5"
              >
                <Icon name="play" size={12} color="#fff" />
                <AppText className="text-[11px] font-semibold text-white">
                  {post.counts.views.toLocaleString()}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
