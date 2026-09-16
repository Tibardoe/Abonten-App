import { logger } from "@abonten/core/logger";
import type {
  FollowStatus,
  FollowTargetKind,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { checkRateLimit } from "../security/rateLimit";
import { notifyFollow } from "./contentNotifyCore";
import { readContentSettings } from "./contentProgram";
import {
  type Envelope,
  FAIL,
  accountIsRestricted,
  usersBlocked,
} from "./contentShared";

// The canonical follow graph (organizers and places). Following is a social
// relationship — it drives the Stories tray and the Following feed — and is
// deliberately separate from the "Notify me" consent (notification
// subscriptions). No client write grants: everything goes through here.

async function targetOwner(
  supabase: ServiceRoleClient,
  kind: FollowTargetKind,
  id: string,
): Promise<{ ownerId: string; label: string } | null> {
  if (kind === "place") {
    const { data } = await supabase
      .from("place")
      .select("id, owner_id, name, status, moderation_state")
      .eq("id", id)
      .maybeSingle();
    if (
      !data ||
      data.status !== "published" ||
      ["hidden", "removed"].includes(data.moderation_state ?? "")
    ) {
      return null;
    }
    return { ownerId: data.owner_id, label: data.name };
  }
  const { data } = await supabase
    .from("user_info")
    .select("id, username, status_id")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status_id !== 1) return null;
  return {
    ownerId: data.id,
    label: data.username ? `@${data.username}` : "you",
  };
}

export async function getFollowStatusCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: { targetKind: FollowTargetKind; targetId: string },
): Promise<Envelope<FollowStatus>> {
  const [{ data: counts }, following] = await Promise.all([
    supabase.rpc("follow_counts", {
      p_kind: input.targetKind,
      p_ids: [input.targetId],
    }),
    userId
      ? supabase
          .from("follow")
          .select("id")
          .eq("follower_id", userId)
          .eq("target_kind", input.targetKind)
          .eq("target_id", input.targetId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    status: 200,
    data: {
      following: !!following.data,
      followerCount: Number(counts?.[0]?.follower_count ?? 0),
    },
  };
}

export async function setFollowCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { targetKind: FollowTargetKind; targetId: string; following: boolean },
): Promise<Envelope<FollowStatus>> {
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  if (input.targetKind === "organizer" && input.targetId === userId) {
    return { status: 400, message: "You can't follow yourself." };
  }
  const settings = await readContentSettings(supabase);
  const perHour = settings?.follows_per_hour ?? 100;
  if (!(await checkRateLimit(`follow:${userId}`, perHour, 3600))) {
    return {
      status: 429,
      message: "Too many changes. Please try again later.",
    };
  }

  if (!input.following) {
    const { error } = await supabase
      .from("follow")
      .delete()
      .eq("follower_id", userId)
      .eq("target_kind", input.targetKind)
      .eq("target_id", input.targetId);
    if (error) {
      logger.error(`unfollow failed: ${error.message}`);
      return FAIL;
    }
    return getFollowStatusCore(supabase, userId, input);
  }

  const target = await targetOwner(supabase, input.targetKind, input.targetId);
  if (!target) {
    return {
      status: 404,
      message:
        input.targetKind === "place"
          ? "Place not found."
          : "Organizer not found.",
    };
  }
  if (target.ownerId === userId) {
    return { status: 400, message: "This is your own place." };
  }
  if (await usersBlocked(supabase, userId, target.ownerId)) {
    return { status: 403, message: "You can't follow this account." };
  }

  const { error } = await supabase.from("follow").insert({
    follower_id: userId,
    target_kind: input.targetKind,
    target_id: input.targetId,
  });
  if (error && error.code !== "23505") {
    logger.error(`follow failed: ${error.message}`);
    return FAIL;
  }
  if (!error) {
    await notifyFollow(
      supabase,
      { kind: input.targetKind, ownerId: target.ownerId, label: target.label },
      userId,
    );
  }
  return getFollowStatusCore(supabase, userId, input);
}

export type FollowingEntry = {
  targetKind: FollowTargetKind;
  targetId: string;
  name: string;
  username: string | null;
  slug: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
  createdAt: string;
};

/** The caller's own follow list (settings / profile). */
export async function listFollowingCore(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<Envelope<FollowingEntry[]>> {
  const { data, error } = await supabase
    .from("follow")
    .select("target_kind, target_id, created_at")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    logger.error(`listFollowingCore failed: ${error.message}`);
    return FAIL;
  }
  const rows = data ?? [];
  const userIds = rows
    .filter((r) => r.target_kind === "organizer")
    .map((r) => r.target_id);
  const placeIds = rows
    .filter((r) => r.target_kind === "place")
    .map((r) => r.target_id);
  const [users, places] = await Promise.all([
    userIds.length
      ? supabase
          .from("user_info")
          .select("id, username, full_name, avatar_public_id, avatar_version")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    placeIds.length
      ? supabase
          .from("place")
          .select("id, name, slug, cover_public_id, cover_version")
          .in("id", placeIds)
      : Promise.resolve({ data: [] }),
  ]);
  const userMap = new Map((users.data ?? []).map((u) => [u.id, u]));
  const placeMap = new Map((places.data ?? []).map((p) => [p.id, p]));
  const out: FollowingEntry[] = [];
  for (const r of rows) {
    if (r.target_kind === "place") {
      const p = placeMap.get(r.target_id);
      if (!p) continue;
      out.push({
        targetKind: "place",
        targetId: p.id,
        name: p.name,
        username: null,
        slug: p.slug,
        avatarPublicId: p.cover_public_id,
        avatarVersion: p.cover_version,
        createdAt: r.created_at,
      });
    } else {
      const u = userMap.get(r.target_id);
      if (!u) continue;
      out.push({
        targetKind: "organizer",
        targetId: u.id,
        name: u.full_name ?? (u.username as string | null) ?? "Organizer",
        username: u.username as string | null,
        slug: null,
        avatarPublicId: u.avatar_public_id,
        avatarVersion: u.avatar_version,
        createdAt: r.created_at,
      });
    }
  }
  return { status: 200, data: out };
}
