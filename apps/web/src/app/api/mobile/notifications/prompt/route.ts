import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getPromptOfferCore } from "@abonten/services/notifications/promptCore";
import { promptContextSchema } from "@abonten/validation/discoverySchemas";

// GET /api/mobile/notifications/prompt?context=purchase|rsvp&eventId=
//     /api/mobile/notifications/prompt?context=place&placeId=&trigger=favorite|review|visit
// What an opt-in card may offer. Empty when nothing should be asked.
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    { schema: promptContextSchema, label: "GET /notifications/prompt" },
    ({ svc, userId, data }) => getPromptOfferCore(svc, signedIn(userId), data),
  );
}
