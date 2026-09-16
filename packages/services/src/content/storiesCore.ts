import { logger } from "@abonten/core/logger";
import type {
  ContentPublisher,
  ContentPublisherKind,
  StorySequence,
  StoryTray,
  StoryTrayEntry,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { resolveContentAccess } from "./contentProgram";
import {
  type Envelope,
  FAIL,
  accountIsRestricted,
  loadPostDocuments,
  loadPublisher,
} from "./contentShared";

// Stories: the tray shown in Messages, one publisher's active sequence, and
// per-publisher muting. Expiry is decided by the database on every read
// (content_story_tray / content_post_documents use now()).

export async function getStoryTrayCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<Envelope<StoryTray>> {
  const { program } = await resolveContentAccess(supabase, userId);
  if (!program.stories) {
    return { status: 200, data: { entries: [], canPublish: false } };
  }
  if (!userId) {
    return { status: 200, data: { entries: [], canPublish: false } };
  }
  const { data, error } = await supabase.rpc("content_story_tray", {
    p_viewer: userId,
  });
  if (error) {
    logger.error(`content_story_tray failed: ${error.message}`);
    return FAIL;
  }
  const rows = data ?? [];
  const userIds = rows
    .filter((r) => r.publisher_kind !== "place")
    .map((r) => r.publisher_id);
  const placeIds = rows
    .filter((r) => r.publisher_kind === "place")
    .map((r) => r.publisher_id);
  const [users, places, mutes] = await Promise.all([
    userIds.length
      ? supabase
          .from("user_info")
          .select(
            "id, username, full_name, avatar_public_id, avatar_version, organizer_verified",
          )
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    placeIds.length
      ? supabase
          .from("place")
          .select(
            "id, name, slug, cover_public_id, cover_version, verified, owner_id",
          )
          .in("id", placeIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("content_mute")
      .select("publisher_kind, publisher_id")
      .eq("user_id", userId),
  ]);
  const userMap = new Map((users.data ?? []).map((u) => [u.id, u]));
  const placeMap = new Map((places.data ?? []).map((p) => [p.id, p]));
  const muted = new Set(
    (mutes.data ?? []).map((m) => `${m.publisher_kind}:${m.publisher_id}`),
  );

  const entries: StoryTrayEntry[] = [];
  for (const r of rows) {
    let publisher: ContentPublisher | null = null;
    if (r.publisher_kind === "place") {
      const p = placeMap.get(r.publisher_id);
      if (p) {
        publisher = {
          kind: "place",
          id: p.id,
          name: p.name,
          slug: p.slug,
          avatarPublicId: p.cover_public_id,
          avatarVersion: p.cover_version,
          verified: p.verified,
          ownerId: p.owner_id,
        };
      }
    } else {
      const u = userMap.get(r.publisher_id);
      if (u) {
        publisher =
          r.publisher_kind === "abonten"
            ? {
                kind: "abonten",
                id: u.id,
                name: "Abonten",
                username: "abonten",
                avatarPublicId: null,
                avatarVersion: null,
                verified: true,
              }
            : {
                kind: "organizer",
                id: u.id,
                name:
                  u.full_name ?? (u.username as string | null) ?? "Organizer",
                username: u.username as string | null,
                avatarPublicId: u.avatar_public_id,
                avatarVersion: u.avatar_version,
                verified: !!u.organizer_verified,
              };
      }
    }
    if (!publisher) continue;
    entries.push({
      publisher,
      storyIds: r.story_ids ?? [],
      storyCount: r.story_count,
      latestAt: r.latest_at,
      hasUnseen: r.has_unseen,
      isSelf: r.is_self,
      muted: muted.has(`${r.publisher_kind}:${r.publisher_id}`),
    });
  }
  return {
    status: 200,
    data: { entries, canPublish: program.storiesPosting },
  };
}

/** One publisher's active Stories, oldest first, for the viewer. */
export async function getStorySequenceCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: { publisherKind: ContentPublisherKind; publisherId: string },
): Promise<Envelope<StorySequence>> {
  const { program } = await resolveContentAccess(supabase, userId);
  const publisher = await loadPublisher(
    supabase,
    input.publisherKind,
    input.publisherId,
  );
  if (!publisher) return { status: 404, message: "Publisher not found." };
  const isSelf =
    !!userId &&
    (input.publisherKind === "place"
      ? publisher.ownerId === userId
      : publisher.id === userId);
  if (!program.stories && !isSelf) {
    return { status: 403, message: "Stories aren't available yet." };
  }
  let query = supabase
    .from("content_post")
    .select("id")
    .eq("kind", "story")
    .eq("status", "published")
    .in("moderation_state", ["visible", "restricted"])
    .gt("expires_at", new Date().toISOString())
    .order("published_at", { ascending: true })
    .limit(50);
  query =
    input.publisherKind === "place"
      ? query.eq("publisher_place_id", input.publisherId)
      : query
          .eq("author_id", input.publisherId)
          .eq("publisher_kind", input.publisherKind);
  const { data, error } = await query;
  if (error) {
    logger.error(`getStorySequenceCore failed: ${error.message}`);
    return FAIL;
  }
  const stories = await loadPostDocuments(
    supabase,
    userId,
    (data ?? []).map((r) => r.id),
  );
  return { status: 200, data: { publisher, stories } };
}

export async function setStoryMuteCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    publisherKind: ContentPublisherKind;
    publisherId: string;
    muted: boolean;
  },
): Promise<Envelope<{ muted: boolean }>> {
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  if (input.muted) {
    const { error } = await supabase.from("content_mute").upsert(
      {
        user_id: userId,
        publisher_kind: input.publisherKind,
        publisher_id: input.publisherId,
      },
      { onConflict: "user_id,publisher_kind,publisher_id" },
    );
    if (error) {
      logger.error(`setStoryMuteCore failed: ${error.message}`);
      return FAIL;
    }
  } else {
    const { error } = await supabase
      .from("content_mute")
      .delete()
      .eq("user_id", userId)
      .eq("publisher_kind", input.publisherKind)
      .eq("publisher_id", input.publisherId);
    if (error) {
      logger.error(`setStoryMuteCore failed: ${error.message}`);
      return FAIL;
    }
  }
  return { status: 200, data: { muted: input.muted } };
}
