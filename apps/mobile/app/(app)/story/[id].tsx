import { ReportSheet } from "@/components/ReportSheet";
import { AppHeader } from "@/components/app/AppHeader";
import { MediaStatusBar } from "@/components/app/MediaStatusBar";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { StoryViewer } from "@/components/content/StoryViewer";
import { publisherRoute } from "@/features/content/contentLinks";
import { useContentPost } from "@/features/content/useContent";
import { useQueryView } from "@/lib/useQueryView";
import { STORY_EXPIRED_MESSAGE_KEY } from "@abonten/core/content/copy";
import type { ContentPostDocument } from "@abonten/types/contentType";
import { AppText, Avatar, Button, Spinner } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

// A shared Story link (also a Story reply's preview in Messages). A live
// Story opens in the viewer at that Story; an ended one says so and offers
// the publisher instead.
export default function StoryLinkScreen() {
  const t = useTranslations("spotlight");
  const tc = useTranslations("core");

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

  // 404/410 come back as data (an answer to show); no data at all is
  // loading, offline or a failed request.
  const view = useQueryView(q);
  if (!res && view.kind !== "content") {
    return (
      <View className="flex-1 bg-black">
        <MediaStatusBar />
        {view.kind === "loading" ? (
          <Spinner />
        ) : (
          <QueryUnavailable
            view={view}
            subject={t("thisStory")}
            onRetry={() => q.refetch()}
            onMedia
          />
        )}
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
            label={reportFor.caption?.slice(0, 80) || t("story")}
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
        title={t("story")}
        backFallback="/(app)/(tabs)/messages"
      />
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <AppText variant="sectionTitle" className="text-center">
          {res?.status === 410
            ? tc(STORY_EXPIRED_MESSAGE_KEY)
            : t("thisStoryIsnTAvailable")}
        </AppText>
        <AppText variant="muted" className="text-center">
          {t("storiesAreOnlyUpForA")}
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
            title={t("seeMoreFrom", { name: expiredPublisher?.name ?? "" })}
            onPress={() => router.replace(route as never)}
          />
        ) : null}
      </View>
    </View>
  );
}
