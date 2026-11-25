import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { checkUsernameAvailabilityCore } from "@abonten/services/profile/usernameAvailabilityCore";
import { usernameCheckSchema } from "@abonten/validation/usernameSchemas";

// POST /api/mobile/usernames/check   { username, teamId?, forNewTeam?, name? }
// "Is this username free?" as the person types (Edit profile, a team's
// profile, Make a team): available / taken / yours / invalid, with two or
// three free suggestions when taken. Rate-limited per person; answers only
// for a well-formed handle. Same service as the website's
// checkUsernameAvailability action.
export const POST = teamRoute<Record<string, string>>()(
  "POST /usernames/check",
  usernameCheckSchema,
  (svc, userId, input) => checkUsernameAvailabilityCore(svc, userId, input),
);
