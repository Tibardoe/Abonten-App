import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// Register / unregister a mobile device's Expo push token for one user.
// Called only from the /api/mobile/devices/* routes, which authenticate the
// caller with a Bearer session first and pass the *verified* `userId` here —
// so identity is already proven. A service-role client is used (not the
// caller's RLS client) so that a push token which moved to a new device
// owner can be reassigned: the owner-only RLS `USING` clause would otherwise
// block an upsert from touching the previous owner's row. Same "service
// client behind an independent identity check" pattern as ticketInventory.ts.

export type DeviceTokenResult = { status: 200 | 400 | 500; message: string };

const PLATFORMS = new Set(["ios", "android"]);

export async function registerDeviceTokenCore(
  userId: string,
  input: { token?: unknown; platform?: unknown },
): Promise<DeviceTokenResult> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  const platform = typeof input.platform === "string" ? input.platform : "";

  if (!token || !PLATFORMS.has(platform)) {
    return { status: 400, message: "A valid token and platform are required" };
  }

  const supabase = getSupabaseServiceClient();

  // Upsert on the unique `token`: the same physical device re-registers on
  // every launch; a device that changed hands moves to the new user.
  const { error } = await supabase.from("device_token").upsert(
    {
      user_id: userId,
      token,
      platform,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) {
    logger.error(`Failed registering device token: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Device registered" };
}

export async function unregisterDeviceTokenCore(
  userId: string,
  token: string,
): Promise<DeviceTokenResult> {
  if (!token) {
    return { status: 400, message: "A token is required" };
  }

  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("device_token")
    .delete()
    .eq("token", token)
    .eq("user_id", userId);

  if (error) {
    logger.error(`Failed unregistering device token: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Device unregistered" };
}
