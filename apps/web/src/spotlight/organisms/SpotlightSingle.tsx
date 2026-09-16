"use client";

import { getContentPost } from "@/actions/content/getContentPost";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContentProgram } from "../hooks/useContentProgram";
import SpotlightCard from "./SpotlightCard";

// A single Spotlight opened from a shared link or a notification.
export default function SpotlightSingle({ postId }: { postId: string }) {
  const { isLoading: userLoading, data: user } = useCurrentUser();
  const { ready } = useContentProgram();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["content", "post", postId, user?.id ?? null],
    enabled: !userLoading,
    queryFn: () => getContentPost({ postId }),
  });

  if (!ready || query.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const res = query.data;
  const post =
    res && res.status === 200 && "data" in res && res.data && "post" in res.data
      ? res.data.post
      : null;

  if (!post || post.kind !== "spotlight") {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-bold">This Spotlight isn't available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {(res && "message" in res ? res.message : null) ??
            "It may have been removed."}
        </p>
        <Link
          href="/spotlight"
          className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
        >
          Go to Spotlight
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1
              ? router.back()
              : router.push("/spotlight")
          }
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <Link
          href="/spotlight"
          className="text-sm font-semibold text-primary hover:underline"
        >
          More Spotlights
        </Link>
      </div>
      <div className="h-[calc(100dvh-13rem)] overflow-hidden rounded-2xl">
        <SpotlightCard
          item={{ post, sponsored: null }}
          active
          surface="deep_link"
          onHide={() => router.push("/spotlight")}
        />
      </div>
    </div>
  );
}
