import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  getNotificationPreferencesCore,
  updateNotificationPreferencesCore,
} from "@abonten/services/notifications/preferencesCore";
import { notificationPreferencesPatchSchema } from "@abonten/validation/discoverySchemas";
import { z } from "zod";

// GET /api/mobile/notifications/preferences
// PUT /api/mobile/notifications/preferences  { recommendationsPush?, organizerAlertsPush?,
//   placeUpdatesPush?, socialPush?, rewardEmails?, pause?: "two_weeks" | "resume" }
// Same services as the web getNotificationPreferences / updateNotificationPreferences actions.
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /notifications/preferences",
    },
    ({ svc, userId }) => getNotificationPreferencesCore(svc, signedIn(userId)),
  );
}

export async function PUT(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: notificationPreferencesPatchSchema,
      label: "PUT /notifications/preferences",
    },
    ({ svc, userId, data }) =>
      updateNotificationPreferencesCore(svc, signedIn(userId), data),
  );
}
