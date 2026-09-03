import { logger } from "@abonten/core/logger";
import type {
  AdminContext,
  ModeratableTargetType,
  ModerationActionKind,
} from "@abonten/types/adminTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Applies a content-moderation action (hide/unhide/remove/restore/restrict/
// unrestrict) by delegating the atomic DB change to the apply_moderation_action
// RPC — which inserts the moderation_action row (idempotency_key guard),
// flips the target's moderation_state, and appends a report_event when
// linked. Idempotent: a replayed idempotency_key returns the original
// outcome without a second effect (spec §44).

const PERMISSION_FOR: Record<
  ModerationActionKind,
  AdminContext["permissions"][number]
> = {
  hide: "moderation.hide",
  unhide: "moderation.restore",
  remove: "moderation.remove",
  restore: "moderation.restore",
  restrict: "moderation.restrict",
  unrestrict: "moderation.restrict",
};

export async function applyModerationActionCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  input: {
    targetType: ModeratableTargetType;
    targetId: string;
    action: ModerationActionKind;
    reason: string;
    reportId?: string | null;
    /** optional explicit key; otherwise derived deterministically */
    idempotencyKey?: string;
  },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope<{ newState: string; replayed: boolean }>> {
  try {
    assertPermission(ctx, PERMISSION_FOR[input.action]);
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const idempotencyKey =
    input.idempotencyKey ??
    `${input.targetType}:${input.targetId}:${input.action}:${input.reportId ?? "none"}`;

  const { data, error } = await supabase.rpc("apply_moderation_action", {
    p_actor_id: ctx.userId,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_action: input.action,
    p_reason: input.reason,
    p_report_id: input.reportId ?? null,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    logger.error(`applyModerationActionCore RPC failed: ${error.message}`);
    if (error.code === "42501")
      return { status: 403, message: "Not authorized" };
    return { status: 500, message: "Something went wrong" };
  }

  const result = data as {
    applied: boolean;
    idempotent_replay: boolean;
    new_state?: string;
  };

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `moderation.${input.action}`,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: `${input.action} ${input.targetType}`,
    reason: input.reason,
    after: {
      moderation_state: result.new_state ?? null,
      report_id: input.reportId ?? null,
    },
    requestMeta: {
      ...(requestMeta ?? {}),
      roles: ctx.roles,
      replayed: result.idempotent_replay,
    },
  });

  return {
    status: 200,
    message: result.idempotent_replay
      ? "Already applied."
      : `Content ${input.action === "hide" ? "hidden" : input.action === "remove" ? "removed" : `marked ${result.new_state}`}.`,
    data: {
      newState: result.new_state ?? "unknown",
      replayed: result.idempotent_replay,
    },
  };
}
