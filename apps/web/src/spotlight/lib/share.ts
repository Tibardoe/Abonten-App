import { spotlightPath, storyPath } from "@abonten/core/content/links";
import type {
  ContentKind,
  ContentShareChannel,
} from "@abonten/types/contentType";

export function contentShareUrl(kind: ContentKind, postId: string): string {
  const path = kind === "story" ? storyPath(postId) : spotlightPath(postId);
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_BASE_URL ?? "");
  return `${origin}${path}`;
}

/**
 * Opens the system share sheet when the browser has one, otherwise copies
 * the link. Resolves to the channel used, or null when the visitor backed
 * out (nothing is recorded then).
 */
export async function shareContent(
  kind: ContentKind,
  postId: string,
  title: string,
): Promise<ContentShareChannel | null> {
  const url = contentShareUrl(kind, postId);
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ title, url });
      return "native";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copy_link";
  } catch {
    return null;
  }
}
