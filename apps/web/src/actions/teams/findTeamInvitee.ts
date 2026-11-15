"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { findTeamInviteeCore } from "@abonten/services/teams/teamCore";
import { teamInviteeSchema } from "@abonten/validation/teamSchemas";

/** Who an Owner is about to invite: a username's public profile, or a masked number. */
export const findTeamInvitee = withActionLocale(async function findTeamInvitee(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(teamInviteeSchema, raw);
  if (input.error) return input.error;
  return findTeamInviteeCore(caller.svc, caller.userId, input.data);
});
