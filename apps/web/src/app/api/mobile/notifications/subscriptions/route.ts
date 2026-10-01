import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import {
  listSubscriptionsCore,
  subscribeCore,
} from "@abonten/services/notifications/subscriptionCore";
import { subscribeSchema } from "@abonten/validation/discoverySchemas";
import { z } from "zod";

// GET  /api/mobile/notifications/subscriptions            what the caller follows
// POST /api/mobile/notifications/subscriptions { target, source }  "Notify me"
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /notifications/subscriptions",
    },
    ({ svc, userId }) => listSubscriptionsCore(svc, signedIn(userId)),
  );
}

export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: subscribeSchema, label: "POST /notifications/subscriptions" },
    ({ svc, userId, data }) =>
      subscribeCore(svc, signedIn(userId), data.target, data.source),
  );
}
