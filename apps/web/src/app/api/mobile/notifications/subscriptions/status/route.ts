import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { getSubscriptionStatusCore } from "@abonten/services/notifications/subscriptionCore";
import { subscriptionStatusSchema } from "@abonten/validation/discoverySchemas";

// GET /api/mobile/notifications/subscriptions/status?kind=organizer|place&targetId=
// The "Notify me" bell state. Signed out = not subscribed.
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: subscriptionStatusSchema,
      label: "GET /notifications/subscriptions/status",
      allowAnonymous: true,
    },
    async ({ svc, userId, data }) =>
      userId
        ? getSubscriptionStatusCore(svc, userId, data.kind, data.targetId)
        : { status: 200, data: { subscribed: false, subscriptionId: null } },
  );
}
