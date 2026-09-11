import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import { type FieldOpsEnvelope, notifyFieldOps } from "../shared/fieldOpsRows";

// A team lead's announcement: one in-app notification (+ push) to every
// active member of the team. Team chat is not part of v1; this is the
// broadcast channel.

export async function sendAnnouncementCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; title: string; body: string },
): Promise<FieldOpsEnvelope<{ recipients: number }>> {
  let teamId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, ["team_lead"]);
    teamId = m.teamId;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (campaignStatus === "completed" || campaignStatus === "archived") {
    return { status: 409, message: "The campaign is closed." };
  }
  const { data: members } = await supabase
    .from("fieldops_team_member")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("status", "active")
    .neq("user_id", userId);
  const recipients = (members ?? [])
    .map((m) => m.user_id)
    .filter((id): id is string => !!id);
  await notifyFieldOps(supabase, recipients, {
    type: "fieldops_announcement",
    title: input.title,
    body: input.body,
    route: "/field",
  });
  return {
    status: 200,
    message:
      recipients.length === 0
        ? "No active members to notify yet."
        : `Sent to ${recipients.length} member${recipients.length === 1 ? "" : "s"}.`,
    data: { recipients: recipients.length },
  };
}
