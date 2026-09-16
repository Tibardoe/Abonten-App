"use client";

import { getContentPost } from "@/actions/content/getContentPost";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { STORY_EXPIRED_MESSAGE } from "@abonten/core/content/copy";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublisherIdentity from "../atoms/PublisherIdentity";
import { publisherHref } from "../lib/publisher";
import StoryViewer from "./StoryViewer";

// A shared Story link. A live Story opens in the viewer at that Story; an
// ended one says so and offers the publisher's page instead.
export default function StoryLinkLanding({ postId }: { postId: string }) {
  const router = useRouter();
  const { isLoading: userLoading, data: user } = useCurrentUser();
  const query = useQuery({
    queryKey: ["content", "post", postId, user?.id ?? null],
    enabled: !userLoading,
    queryFn: () => getContentPost({ postId }),
  });

  if (userLoading || query.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const res = query.data;

  if (res && res.status === 200 && res.data.post.kind === "story") {
    const post = res.data.post;
    return (
      <StoryViewer
        queue={[
          {
            publisherKind: post.publisher.kind,
            publisherId: post.publisher.id,
          },
        ]}
        startStoryId={post.id}
        onClose={() => {
          const href = publisherHref(post.publisher);
          router.push(href ?? "/messages");
        }}
      />
    );
  }

  const publisher = res && res.status === 410 ? res.data.publisher : null;
  const href = publisher ? publisherHref(publisher) : null;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-xl font-bold">
        {res?.status === 410
          ? STORY_EXPIRED_MESSAGE
          : "This Story isn't available"}
      </h1>
      <p className="text-sm text-muted-foreground">
        Stories are only up for a short time.
      </p>
      {publisher ? (
        <PublisherIdentity publisher={publisher} tone="default" size={44} />
      ) : null}
      {href ? (
        <Link
          href={href}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          See more from {publisher?.name}
        </Link>
      ) : (
        <Link
          href="/"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Go home
        </Link>
      )}
    </div>
  );
}
