import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createNotificationCore } from "../notifications/createNotification";

// Social notices for Spotlight + Stories through the existing notification
// system (in-app row + push honouring `social_push`). Likes and reactions
// are aggregated: within one hour, a second like on the same post updates
// the unread notice ("A and 3 others liked your Spotlight") instead of
// adding another row, so a popular post never floods its author. Nothing is
// sent to the actor themselves or across a block.

const AGGREGATE_WINDOW_MS = 60 * 60 * 1000;

type Actor = { id: string; name: string };

async function actorName(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("user_info")
    .select("username, full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? (data?.username as string | null) ?? "Someone";
}

async function blocked(
  supabase: ServiceRoleClient,
  a: string,
  b: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("content_users_blocked", {
    p_a: a,
    p_b: b,
  });
  return data === true;
}

type PostTarget = {
  id: string;
  kind: "spotlight" | "story";
  authorId: string;
  thumbnailUrl?: string | null;
};

function postWord(kind: "spotlight" | "story"): string {
  return kind === "story" ? "Story" : "Spotlight";
}

function linkFor(post: PostTarget): string {
  return post.kind === "story"
    ? `/stories/${post.id}`
    : `/spotlight/${post.id}`;
}

/**
 * Aggregated notice: "<actor> liked your Spotlight" the first time, then
 * "<actor> and N others liked your Spotlight" while the previous notice is
 * still unread and under an hour old.
 */
async function notifyAggregated(
  supabase: ServiceRoleClient,
  post: PostTarget,
  actor: Actor,
  type: "content_like" | "content_reaction",
  verb: string,
): Promise<void> {
  if (actor.id === post.authorId) return;
  if (await blocked(supabase, actor.id, post.authorId)) return;

  const since = new Date(Date.now() - AGGREGATE_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from("notification")
    .select("id, data")
    .eq("user_id", post.authorId)
    .eq("type", type)
    .is("read_at", null)
    .gte("created_at", since)
    .contains("data", { postId: post.id })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const data = (recent.data ?? {}) as Record<string, unknown>;
    const actors = Array.isArray(data.actorIds)
      ? (data.actorIds as string[])
      : [];
    if (actors.includes(actor.id)) return;
    const nextActors = [...actors, actor.id];
    const others = nextActors.length - 1;
    await supabase
      .from("notification")
      .update({
        title: `${actor.name} and ${others} ${others === 1 ? "other" : "others"} ${verb} your ${postWord(post.kind)}`,
        data: { ...data, actorIds: nextActors },
      })
      .eq("id", recent.id);
    return;
  }

  await createNotificationCore(supabase, {
    userId: post.authorId,
    type,
    title: `${actor.name} ${verb} your ${postWord(post.kind)}`,
    body: null,
    link: linkFor(post),
    data: {
      kind: post.kind,
      postId: post.id,
      actorIds: [actor.id],
    } as never,
  });
}

export async function notifyContentLike(
  supabase: ServiceRoleClient,
  post: PostTarget,
  actorId: string,
): Promise<void> {
  try {
    const name = await actorName(supabase, actorId);
    await notifyAggregated(
      supabase,
      post,
      { id: actorId, name },
      "content_like",
      "liked",
    );
  } catch (error) {
    logger.error(`notifyContentLike failed: ${error}`);
  }
}

export async function notifyContentReaction(
  supabase: ServiceRoleClient,
  post: PostTarget,
  actorId: string,
  emoji: string,
): Promise<void> {
  try {
    const name = await actorName(supabase, actorId);
    await notifyAggregated(
      supabase,
      post,
      { id: actorId, name },
      "content_reaction",
      `reacted ${emoji} to`,
    );
  } catch (error) {
    logger.error(`notifyContentReaction failed: ${error}`);
  }
}

export async function notifyContentComment(
  supabase: ServiceRoleClient,
  post: PostTarget,
  comment: { id: string; body: string; parentAuthorId: string | null },
  actorId: string,
): Promise<void> {
  try {
    const name = await actorName(supabase, actorId);
    const snippet =
      comment.body.length > 120
        ? `${comment.body.slice(0, 117)}…`
        : comment.body;
    const targets = new Set<string>();
    if (post.authorId !== actorId) targets.add(post.authorId);
    if (comment.parentAuthorId && comment.parentAuthorId !== actorId) {
      targets.add(comment.parentAuthorId);
    }
    for (const userId of targets) {
      if (await blocked(supabase, actorId, userId)) continue;
      const isReply =
        userId === comment.parentAuthorId && userId !== post.authorId;
      await createNotificationCore(supabase, {
        userId,
        type: isReply ? "content_reply" : "content_comment",
        title: isReply
          ? `${name} replied to your comment`
          : `${name} commented on your ${postWord(post.kind)}`,
        body: snippet,
        link: linkFor(post),
        data: {
          kind: post.kind,
          postId: post.id,
          commentId: comment.id,
        } as never,
      });
    }
  } catch (error) {
    logger.error(`notifyContentComment failed: ${error}`);
  }
}

export async function notifyFollow(
  supabase: ServiceRoleClient,
  target: { kind: "organizer" | "place"; ownerId: string; label: string },
  actorId: string,
): Promise<void> {
  try {
    if (target.ownerId === actorId) return;
    if (await blocked(supabase, actorId, target.ownerId)) return;
    const name = await actorName(supabase, actorId);
    const since = new Date(Date.now() - AGGREGATE_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .from("notification")
      .select("id, data")
      .eq("user_id", target.ownerId)
      .eq("type", "content_follow")
      .is("read_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) {
      const data = (recent.data ?? {}) as Record<string, unknown>;
      const actors = Array.isArray(data.actorIds)
        ? (data.actorIds as string[])
        : [];
      if (actors.includes(actorId)) return;
      const nextActors = [...actors, actorId];
      const others = nextActors.length - 1;
      await supabase
        .from("notification")
        .update({
          title: `${name} and ${others} ${others === 1 ? "other" : "others"} started following ${target.label}`,
          data: { ...data, actorIds: nextActors },
        })
        .eq("id", recent.id);
      return;
    }
    await createNotificationCore(supabase, {
      userId: target.ownerId,
      type: "content_follow",
      title: `${name} started following ${target.label}`,
      body: null,
      link: "/spotlight",
      data: { kind: "follow", actorIds: [actorId] } as never,
    });
  } catch (error) {
    logger.error(`notifyFollow failed: ${error}`);
  }
}

export async function notifyModeration(
  supabase: ServiceRoleClient,
  post: PostTarget,
  newState: string,
): Promise<void> {
  try {
    const word = postWord(post.kind);
    const title =
      newState === "visible"
        ? `Your ${word} is visible again`
        : newState === "restricted"
          ? `Your ${word} has been restricted`
          : newState === "hidden"
            ? `Your ${word} has been hidden`
            : `Your ${word} has been removed`;
    await createNotificationCore(supabase, {
      userId: post.authorId,
      type: "content_moderation",
      title,
      body:
        newState === "visible"
          ? null
          : "It no longer appears in feeds. Contact support if you think this is a mistake.",
      link: "/manage/spotlight",
      data: { kind: post.kind, postId: post.id } as never,
    });
  } catch (error) {
    logger.error(`notifyModeration failed: ${error}`);
  }
}

export async function notifyCampaign(
  supabase: ServiceRoleClient,
  campaign: {
    id: string;
    advertiserId: string;
    status: string;
    reason?: string | null;
  },
): Promise<void> {
  try {
    const title =
      campaign.status === "pending_review"
        ? "Your Spotlight promotion is in review"
        : campaign.status === "scheduled"
          ? "Your Spotlight promotion is approved and scheduled"
          : campaign.status === "active"
            ? "Your Spotlight promotion is live"
            : campaign.status === "rejected"
              ? "Your Spotlight promotion was not approved"
              : campaign.status === "paused"
                ? "Your Spotlight promotion is paused"
                : campaign.status === "completed"
                  ? "Your Spotlight promotion has finished"
                  : campaign.status === "refunded"
                    ? "Your Spotlight promotion refund is on its way"
                    : `Your Spotlight promotion is ${campaign.status}`;
    await createNotificationCore(supabase, {
      userId: campaign.advertiserId,
      type: "content_campaign",
      title,
      body: campaign.reason ?? null,
      link: `/manage/spotlight/campaigns/${campaign.id}`,
      data: { kind: "content_campaign", campaignId: campaign.id } as never,
    });
  } catch (error) {
    logger.error(`notifyCampaign failed: ${error}`);
  }
}
