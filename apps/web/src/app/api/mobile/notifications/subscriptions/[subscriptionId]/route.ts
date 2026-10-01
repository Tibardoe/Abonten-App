import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { unsubscribeCore } from "@abonten/services/notifications/subscriptionCore";
import { unsubscribeSchema } from "@abonten/validation/discoverySchemas";

// DELETE /api/mobile/notifications/subscriptions/:subscriptionId
// Always allowed, even while the programme is switched off.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  bindLocaleFromRequest(req);
  const { subscriptionId } = await params;
  return discoveryRoute(
    req,
    {
      schema: unsubscribeSchema,
      label: "DELETE /notifications/subscriptions/:id",
      params: { subscriptionId },
    },
    ({ svc, userId, data }) =>
      unsubscribeCore(svc, signedIn(userId), data.subscriptionId),
  );
}
