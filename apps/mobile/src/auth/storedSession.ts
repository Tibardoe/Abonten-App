import { secureStorage } from "@/lib/secureStore";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

/**
 * The session exactly as supabase-js stored it, without refreshing it. It
 * is only removed on a real sign-out (or a refresh the auth server
 * rejected), never because the network was down.
 */
export async function readStoredSession(): Promise<Session | null> {
  try {
    const key = (supabase.auth as unknown as { storageKey: string }).storageKey;
    const raw = await secureStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    return parsed?.user?.id && parsed.refresh_token
      ? (parsed as Session)
      : null;
  } catch {
    return null;
  }
}

// Set when a request had to go out with the stored, unrefreshed token (see
// api.ts). Whatever it fetched came back 401 and was kept at its last good
// value; the first working token must fetch it all again.
let staleTokenUsed = false;

export function markStaleTokenUsed() {
  staleTokenUsed = true;
}

/** Reads and clears the flag. */
export function takeStaleTokenUsed(): boolean {
  const used = staleTokenUsed;
  staleTokenUsed = false;
  return used;
}
