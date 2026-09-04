import type { Database } from "@abonten/types/database.types";
import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-bound SSR client — used ONLY to establish "who is the signed-in
// human" for the admin console. All privileged reads/writes then go through
// the service-role client after resolveAdminContext() authorizes them.
export async function createSsrClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase env vars");

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component — safe to ignore, middleware refreshes
        }
      },
    },
  });
}
