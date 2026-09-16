import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { ContentPublisher } from "@abonten/types/contentType";

const DEFAULT_AVATAR_ID = "AnonymousProfile_rn6qez";
const DEFAULT_AVATAR_VERSION = "1743533914";

export function publisherAvatarUrl(
  publisher: Pick<ContentPublisher, "avatarPublicId" | "avatarVersion">,
  size = 40,
): string {
  return publisher.avatarPublicId
    ? buildCloudinaryUrl(publisher.avatarPublicId, publisher.avatarVersion, {
        width: size,
        height: size,
      })
    : buildCloudinaryUrl(DEFAULT_AVATAR_ID, DEFAULT_AVATAR_VERSION, {
        width: size,
        height: size,
      });
}

/** Where tapping a publisher goes, or null for Abonten itself. */
export function publisherHref(publisher: ContentPublisher): string | null {
  if (publisher.kind === "place") {
    return publisher.slug ? `/places/${publisher.slug}` : null;
  }
  if (publisher.kind === "organizer") {
    return publisher.username ? `/user/${publisher.username}/posts` : null;
  }
  return null;
}

export function publisherLabel(publisher: ContentPublisher): string {
  if (publisher.kind === "organizer" && publisher.username) {
    return publisher.username;
  }
  return publisher.name;
}
