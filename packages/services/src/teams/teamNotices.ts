import { logger } from "@abonten/core/logger";
import { phoneCountry } from "@abonten/core/phone";
import { trFor } from "../i18n/requestLocale";
import { getMarket } from "../markets/marketConfig";
import { createNotificationCore } from "../notifications/createNotification";
import { sendHubtelSms } from "../sms/hubtelSms";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// The notices of team membership. Each is a registry notice
// (@abonten/core/notifications/notices, `team_*`) worded for the recipient,
// with the role passed as a code the message turns into words. Best-effort:
// a notice that fails never undoes a membership change.

const TEAMS_LINK = "/settings/teams";

async function names(
  ids: string[],
): Promise<
  Map<string, { name: string; avatar: [string | null, string | null] }>
> {
  const { data, error } = await getSupabaseServiceClient()
    .from("user_info")
    .select("id, full_name, username, avatar_public_id, avatar_version")
    .in("id", ids);
  if (error) logger.error(`teamNotices names: ${error.message}`);
  return new Map(
    (data ?? []).map((u) => [
      u.id,
      {
        name: u.full_name?.trim() || u.username || "",
        avatar: [u.avatar_public_id, u.avatar_version],
      },
    ]),
  );
}

async function send(
  userId: string,
  id: string,
  params: Record<string, string>,
  data: Record<string, string>,
  image: [string | null, string | null] | undefined,
): Promise<void> {
  await createNotificationCore(getSupabaseServiceClient(), {
    userId,
    type: id,
    notice: { id, params },
    link: TEAMS_LINK,
    data: { kind: "team", ...data },
    imagePublicId: image?.[0] ?? null,
    imageVersion: image?.[1] ?? null,
  }).catch((error) =>
    logger.error(`teamNotices: ${id} for ${userId} failed (${error})`),
  );
}

type InviteContext = {
  id: string;
  teamId: string;
  role: string;
  toUserId: string | null;
  toPhone: string | null;
  invitedBy: string | null;
  expiresAt: string;
};

async function loadInvite(inviteId: string): Promise<InviteContext | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("team_invite")
    .select("id, team_id, role, to_user_id, to_phone, invited_by, expires_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (error || !data) {
    if (error) logger.error(`teamNotices loadInvite: ${error.message}`);
    return null;
  }
  return {
    id: data.id,
    teamId: data.team_id,
    role: data.role,
    toUserId: data.to_user_id,
    toPhone: data.to_phone,
    invitedBy: data.invited_by,
    expiresAt: data.expires_at,
  };
}

/** To the invited person: a team wants them, in this role. */
export async function noticeTeamInviteReceived(inviteId: string) {
  const invite = await loadInvite(inviteId);
  if (!invite?.toUserId) return;
  const who = await names([invite.teamId]);
  const team = who.get(invite.teamId);
  await send(
    invite.toUserId,
    "team_invite_received",
    { actor: team?.name ?? "", role: invite.role },
    { teamId: invite.teamId, inviteId: invite.id },
    team?.avatar,
  );
}

/** To whoever invited them: the person joined. */
export async function noticeTeamInviteAccepted(
  teamId: string,
  inviterId: string,
  memberId: string,
  role: string,
) {
  const who = await names([teamId, memberId]);
  await send(
    inviterId,
    "team_invite_accepted",
    {
      actor: who.get(memberId)?.name ?? "",
      team: who.get(teamId)?.name ?? "",
      role,
    },
    { teamId, memberId },
    who.get(memberId)?.avatar,
  );
}

/** To the member: an Owner removed them. */
export async function noticeTeamMemberRemoved(
  teamId: string,
  memberId: string,
) {
  const who = await names([teamId]);
  await send(
    memberId,
    "team_member_removed",
    { team: who.get(teamId)?.name ?? "" },
    { teamId },
    who.get(teamId)?.avatar,
  );
}

/** To the member: an Owner gave them another role. */
export async function noticeTeamRoleChanged(
  teamId: string,
  memberId: string,
  role: string,
) {
  const who = await names([teamId]);
  await send(
    memberId,
    "team_role_changed",
    { team: who.get(teamId)?.name ?? "", role },
    { teamId },
    who.get(teamId)?.avatar,
  );
}

/**
 * A text to a number with no account yet, in its market's language. The
 * link opens the Teams page, where the invitation waits for the account
 * whose verified number this is. Returns whether the provider took it.
 */
export async function textTeamInvite(inviteId: string): Promise<boolean> {
  const invite = await loadInvite(inviteId);
  if (!invite?.toPhone) return false;
  const who = await names([invite.teamId]);
  const country = phoneCountry(invite.toPhone);
  const market = country ? await getMarket(country).catch(() => null) : null;
  const t = trFor(market?.defaultLocale ?? "en");
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://abontenhub.com"
  ).replace(/\/+$/, "");
  const link = new URL(TEAMS_LINK, base).toString();
  const sent = await sendHubtelSms({
    toE164: invite.toPhone,
    content: t("teamSmsInvite", {
      team: who.get(invite.teamId)?.name ?? "",
      role: invite.role,
      link,
    }),
    clientReference: `ti-${invite.id}`,
  });
  if (!sent.ok) {
    logger.warn(`textTeamInvite: not sent (${sent.detail})`);
    return false;
  }
  return true;
}
