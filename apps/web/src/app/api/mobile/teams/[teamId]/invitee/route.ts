import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { findTeamInviteeCore } from "@abonten/services/teams/teamCore";
import { teamInviteeSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/:teamId/invitee
//   { target: { kind: "username", username } | { kind: "phone", phone } }
// Who an Owner is about to invite: a username's public profile, or a
// masked number (never said to belong to anyone).
export const POST = teamRoute<{ teamId: string }>()(
  "POST /teams/:teamId/invitee",
  teamInviteeSchema,
  (svc, userId, input) => findTeamInviteeCore(svc, userId, input),
);
