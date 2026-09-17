import { ReportSheet } from "@/components/ReportSheet";
import { AppHeader } from "@/components/app/AppHeader";
import { MediaStatusBar } from "@/components/app/MediaStatusBar";
import { StoryViewer } from "@/components/content/StoryViewer";
import { publisherRoute } from "@/features/content/contentLinks";
import { useContentPost } from "@/features/content/useContent";
import { STORY_EXPIRED_MESSAGE } from "@abonten/core/content/copy";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { AppText, Avatar, Button, Spinner } from "@abonten/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

// A shared Story link (also a Story reply's preview in Messages). A live
// Story opens in the viewer at that Story; an ended one says so and offers
// the publisher instead.
export default function StoryLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useContentPost(id);
  const [reportFor, setReportFor] = useState<ContentPostDocument | null>(null);

  const res = q.data;
  const post =
    res && res.status === 200 && res.data && "post" in res.data
      ? res.data.post
      : null;
  const expiredPublisher =
    res && res.status === 410 && res.data && "publisher" in res.data
      ? res.data.publisher
      : null;

  const leave = () => {
    const route = post ? publisherRoute(post.publisher) : null;
    if (router.canGoBack()) router.back();
    else router.replace((route ?? "/(app)/(tabs)/messages") as never);
  };

  if (q.isLoading) {
    return (
      <View className="flex-1 bg-black">
        <MediaStatusBar />
        <Spinner />
      </View>
    );
  }

  if (post && post.kind === "story") {
    return (
      <View className="flex-1 bg-black">
        <MediaStatusBar />
        <StoryViewer
          queue={[
            {
              publisherKind: post.publisher.kind,
              publisherId: post.publisher.id,
            },
          ]}
          startStoryId={post.id}
          onClose={leave}
          onReport={setReportFor}
        />
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

  const route = expiredPublisher ? publisherRoute(expiredPublisher) : null;
  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="detail"
        title="Story"
        backFallback="/(app)/(tabs)/messages"
      />
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <AppText variant="sectionTitle" className="text-center">
          {res?.status === 410
            ? STORY_EXPIRED_MESSAGE
            : "This Story isn't available"}
        </AppText>
        <AppText variant="muted" className="text-center">
          Stories are only up for a short time.
        </AppText>
        {expiredPublisher ? (
          <View className="items-center gap-2">
            <Avatar
              publicId={expiredPublisher.avatarPublicId}
              version={expiredPublisher.avatarVersion}
              size={56}
            />
            <AppText variant="bodyStrong">{expiredPublisher.name}</AppText>
          </View>
        ) : null}
        {route ? (
          <Button
            title={`See more from ${expiredPublisher?.name}`}
            onPress={() => router.replace(route as never)}
          />
        ) : null}
      </View>
    </View>
  );
}
