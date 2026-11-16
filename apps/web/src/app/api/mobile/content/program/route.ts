import { mobileContentPublisher } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getContentProgramCore } from "@abonten/services/content/contentProgram";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { z } from "zod";

// GET /api/mobile/content/program — what the caller may use (works signed out)
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /content/program",
      allowAnonymous: true,
    },
    async ({ svc, userId }) => {
      // Posting as the team named in the header (stage 4c), when the role
      // covers it; off while it does not.
      const publisher = userId
        ? await mobileContentPublisher(req, userId)
        : null;
      return getContentProgramCore(svc, userId, {
        publisherId: publisher?.accountId ?? null,
        blocked: publisher?.blocked ?? false,
      });
    },
  );
}
