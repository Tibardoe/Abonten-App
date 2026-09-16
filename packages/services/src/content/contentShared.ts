import { logger } from "@abonten/core/logger";
import type {
  ContentPostDocument,
  ContentPublisher,
} from "@abonten/types/contentType";
import type { Json } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// Helpers every content service shares: the envelope, loading post
// documents, a publisher summary and the "restricted account" check.

export type Envelope<T = undefined> = {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500;
  message?: string;
  data?: T;
};

export const FAIL: Envelope<never> = {
  status: 500,
  message: "Something went wrong. Please try again.",
};

export async function loadPostDocuments(
  supabase: ServiceRoleClient,
  viewerId: string | null,
  ids: string[],
): Promise<ContentPostDocument[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("content_post_documents", {
    p_viewer: viewerId as unknown as string,
    p_ids: ids,
  });
  if (error) {
    logger.error(`content_post_documents failed: ${error.message}`);
    throw new Error(error.message);
  }
  return (data ?? []).map(
    (row) => row.document as unknown as ContentPostDocument,
  );
}

export async function loadPostDocument(
  supabase: ServiceRoleClient,
  viewerId: string | null,
  id: string,
): Promise<ContentPostDocument | null> {
  const docs = await loadPostDocuments(supabase, viewerId, [id]);
  return docs[0] ?? null;
}

export async function loadPublisher(
  supabase: ServiceRoleClient,
  kind: "organizer" | "place" | "abonten",
  id: string,
): Promise<ContentPublisher | null> {
  if (kind === "place") {
    const { data } = await supabase
      .from("place")
      .select(
        "id, name, slug, cover_public_id, cover_version, verified, owner_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      kind: "place",
      id: data.id,
      name: data.name,
      slug: data.slug,
      avatarPublicId: data.cover_public_id,
      avatarVersion: data.cover_version,
      verified: data.verified,
      ownerId: data.owner_id,
    };
  }
  const { data } = await supabase
    .from("user_info")
    .select(
      "id, username, full_name, avatar_public_id, avatar_version, organizer_verified",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  if (kind === "abonten") {
    return {
      kind: "abonten",
      id: data.id,
      name: "Abonten",
      username: "abonten",
      avatarPublicId: null,
      avatarVersion: null,
      verified: true,
    };
  }
  return {
    kind: "organizer",
    id: data.id,
    name: data.full_name ?? (data.username as string | null) ?? "Organizer",
    username: data.username as string | null,
    avatarPublicId: data.avatar_public_id,
    avatarVersion: data.avatar_version,
    verified: !!data.organizer_verified,
  };
}

/** A suspended, banned or deleted account may read but never write. */
export async function accountIsRestricted(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_info")
    .select("status_id")
    .eq("id", userId)
    .maybeSingle();
  return !data || data.status_id !== 1;
}

export async function usersBlocked(
  supabase: ServiceRoleClient,
  a: string | null,
  b: string,
): Promise<boolean> {
  if (!a) return false;
  const { data } = await supabase.rpc("content_users_blocked", {
    p_a: a,
    p_b: b,
  });
  return data === true;
}

export function asJson(value: unknown): Json {
  return value as Json;
}
