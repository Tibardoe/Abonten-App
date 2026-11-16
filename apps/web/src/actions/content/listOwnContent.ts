"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { listOwnContentPostsCore } from "@abonten/services/content/contentPostCore";
import { ownContentRequestSchema } from "@abonten/validation/contentSchemas";

/** The creator's own posts in every state. */
export const listOwnContent = withActionLocale(async function listOwnContent(
  input: unknown,
) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(ownContentRequestSchema, input);
  if (parsed.error) return parsed.error;
  // The team's posts while managing as it (stage 4c); the person's own
  // when asked for them (their own profile).
  if (parsed.data.personal) {
    return listOwnContentPostsCore(caller.svc, caller.userId, parsed.data);
  }
  const actor = await actingFor(caller.userId, "content.post");
  if (actor.error) return actor.error;
  return listOwnContentPostsCore(caller.svc, actor.accountId, parsed.data);
});
