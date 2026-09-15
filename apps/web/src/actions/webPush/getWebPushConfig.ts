"use server";

import { getWebPushConfig as readWebPushConfig } from "@abonten/services/notifications/webPushCore";

/**
 * The VAPID public key browsers subscribe with, or null while web push isn't
 * configured on this deployment. Public information; no sign-in needed.
 * Web-only (the app uses Expo push), so there's no /api/mobile twin.
 */
export async function getWebPushConfig(): Promise<{
  publicKey: string | null;
}> {
  return readWebPushConfig();
}
