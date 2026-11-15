import { z } from "zod";
import { sendTicketTargetSchema } from "./ticketTransferSchemas";

// Team accounts: the inputs of the web Server Actions and of
// /api/mobile/teams/** (docs/architecture/team-accounts.md). Who is asking
// is never in a payload: the transport proves it. The sentences are the
// shared validation catalog's, so they read in the person's language.

const uuid = z.string().uuid("Invalid id");

// Same rules as a person's username (editProfileSchema, user_info_username_check).
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const DELETED_ACCOUNT_USERNAME = /^deleted_/i;

const teamUsername = z
  .string()
  .trim()
  .min(3, { message: "Username must be at least 3 characters." })
  .max(30, { message: "Username must be 30 characters or fewer." })
  .regex(USERNAME_REGEX, {
    message: "Username can only contain letters, numbers and underscores.",
  })
  .refine((value) => !DELETED_ACCOUNT_USERNAME.test(value), {
    message: "This username isn't available.",
  });

const teamName = z
  .string()
  .trim()
  .min(1, { message: "Name is required." })
  .max(80, { message: "Name must be 80 characters or fewer." });

export const teamRoleSchema = z.enum([
  "owner",
  "finance",
  "manager",
  "content",
  "door",
  "front_desk",
]);

export const createTeamSchema = z.object({
  name: teamName,
  username: teamUsername,
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

/** A request with nothing to check (the caller is proved by the transport). */
export const noInputSchema = z.object({});

export const teamIdSchema = z.object({ teamId: uuid });

export const renameTeamSchema = z.object({ teamId: uuid, name: teamName });

export const inviteTeamMemberSchema = z.object({
  teamId: uuid,
  role: teamRoleSchema,
  target: sendTicketTargetSchema,
});
export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;

export const teamInviteeSchema = z.object({
  teamId: uuid,
  target: sendTicketTargetSchema,
});

export const teamInviteIdSchema = z.object({ inviteId: uuid });

/** "Managing as": a team id, or null for the person's own account. */
export const actingTeamSchema = z.object({ teamId: uuid.nullable() });

export const answerTeamInviteSchema = z.object({
  inviteId: uuid,
  action: z.enum(["accept", "decline"]),
});

export const teamMemberSchema = z.object({ teamId: uuid, userId: uuid });

export const teamMemberRoleSchema = z.object({
  teamId: uuid,
  userId: uuid,
  role: teamRoleSchema,
});

// ── Admin ───────────────────────────────────────────────────────────

export const teamSettingsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(5, "Give a short reason for this change")
    .max(500),
  patch: z
    .object({
      enabled: z.boolean(),
      audience: z.enum(["staff", "beta", "all"]),
      betaUserIds: z.array(uuid).max(500),
      maxTeamsCreated: z.number().int().min(1).max(50),
      maxMembers: z.number().int().min(2).max(500),
      inviteHours: z.number().int().min(1).max(720),
      textsPerTeamPerDay: z.number().int().min(0).max(200),
    })
    .partial(),
});
export type TeamSettingsInput = z.infer<typeof teamSettingsSchema>;
