import { useSession } from "@/auth/SessionProvider";
import { setPendingRedirect } from "@/lib/authRedirect";
import { type ShareOutcome, shareLink } from "@/lib/share";
import { spotlightPath, storyPath } from "@abonten/core/content/links";
import type {
  ContentKind,
  ContentPostDocument,
  ContentPublisher,
} from "@abonten/types/contentType";
import { usePathname, useRouter } from "expo-router";
import { useCallback } from "react";

const SITE = "https://abontenhub.com";

export function contentShareUrl(kind: ContentKind, postId: string): string {
  return `${SITE}${kind === "story" ? storyPath(postId) : spotlightPath(postId)}`;
}

export function shareContent(
  post: Pick<ContentPostDocument, "id" | "kind" | "publisher">,
): Promise<ShareOutcome> {
  const noun = post.kind === "story" ? "Story" : "Spotlight";
  return shareLink(
    `${noun} from ${post.publisher.name} on Abonten`,
    contentShareUrl(post.kind, post.id),
  );
}

/** The native route for a publisher, or null for Abonten itself. */
export function publisherRoute(publisher: ContentPublisher): string | null {
  if (publisher.kind === "place") return `/(app)/place/${publisher.id}`;
  if (publisher.kind === "organizer" && publisher.username) {
    return `/(app)/user/${publisher.username}`;
  }
  return null;
}

export function publisherLabel(publisher: ContentPublisher): string {
  return publisher.kind === "organizer" && publisher.username
    ? publisher.username
    : publisher.name;
}

/** Returns a guard: true when signed in, otherwise opens sign-in. */
export function useRequireSignIn() {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(() => {
    if (session) return true;
    if (pathname) setPendingRedirect(pathname);
    router.push("/(auth)/sign-in");
    return false;
  }, [session, pathname, router]);
}
