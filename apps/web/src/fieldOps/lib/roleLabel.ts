import type { FieldOpsMemberRole } from "@abonten/types/fieldOps";

/**
 * A member's role as a key of the `fieldOps` namespace. The role itself is
 * a code ("team_lead"); it is never shown as it is.
 */
export const FIELD_OPS_ROLE_LABEL = {
  team_lead: "teamLead",
  content_creator: "contentCreator",
  offline_member: "fieldMember",
  online_member: "onlineMember",
} as const satisfies Record<FieldOpsMemberRole, string>;
