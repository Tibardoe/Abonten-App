import { createClient } from "@/config/supabase/server";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared plumbing for the Pay small small Server Actions
// (src/actions/ticketPlans/*): resolves the signed-in person from the
// cookie session. The plan tables have no client access, so the cores write
// with the service role after this; the session client is passed on only
// where a core reads the caller's own rows through it (saved payment
// methods, Abonten Credit). The /api/mobile/ticket-plans/** routes call the
// same cores with the Bearer session.

export type TicketPlanCaller =
  | {
      supabase: SupabaseClient<Database>;
      userId: string;
      email: string | undefined;
      error: null;
    }
  | { error: { status: 401; message: string } };

export async function requireTicketPlanUser(): Promise<TicketPlanCaller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: { status: 401, message: tr("pleaseSignInFirst") } };
  }
  return { supabase, userId: user.id, email: user.email, error: null };
}
