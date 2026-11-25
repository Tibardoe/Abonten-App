import { z } from "zod";

// "Is this username free?" as a person types, for people and teams
// (@abonten/services/profile/usernameAvailabilityCore). The handle itself
// is checked by the service, which answers "invalid" with the reason
// instead of refusing the request, so the field can say what is wrong.
export const usernameCheckSchema = z.object({
  username: z.string().max(64),
  /** A team the caller is an Owner of. */
  teamId: z.string().uuid("Invalid id").nullish(),
  /** The Make-a-team form: the handle is for a team not made yet. */
  forNewTeam: z.boolean().optional(),
  /** The team name typed beside it (Make-a-team), for suggestions. */
  name: z.string().trim().max(80).nullish(),
});
export type UsernameCheckInput = z.infer<typeof usernameCheckSchema>;
