import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import {
  answerTeamInviteCore,
  cancelTeamInviteCore,
} from "@abonten/services/teams/teamCore";
import {
  answerTeamInviteSchema,
  teamInviteIdSchema,
} from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/invites/:inviteId   { action: "accept" | "decline" }
// The invited person joins the team or says no.
export const POST = teamRoute<{ inviteId: string }>()(
  "POST /teams/invites/:inviteId",
  answerTeamInviteSchema,
  (svc, userId, input) => answerTeamInviteCore(svc, userId, input),
);

// DELETE /api/mobile/teams/invites/:inviteId
// An Owner withdraws an invitation still waiting.
export const DELETE = teamRoute<{ inviteId: string }>()(
  "DELETE /teams/invites/:inviteId",
  teamInviteIdSchema,
  (svc, userId, input) => cancelTeamInviteCore(svc, userId, input.inviteId),
  { body: false },
);
