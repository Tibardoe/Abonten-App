import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// A Supabase client backed by the service-role key, branded so that
// privileged-only code (the entire packages/services/src/admin/** layer,
// per its own convention of "every fn takes a service-role client + a
// pre-resolved AdminContext") can require it in its type signature instead
// of accepting any SupabaseClient<Database> and only being correct today
// because every current caller happens to pass the right one.
//
// The only two producers are getSupabaseServiceClient()
// (packages/services/src/supabase/serviceClient.ts) and getServiceClient()
// (apps/admin/src/lib/serviceClient.ts), each of which casts its
// service-role client to this type once at the source. A plain
// SupabaseClient<Database> (e.g. a buyer/organizer's own cookie session)
// has no `__brand` property, so passing one where a ServiceRoleClient is
// required is a compile error, not a runtime "permission denied" that a
// caller's error handling might silently swallow -- exactly the failure
// mode found and fixed 2026-09-06 in get_transaction_refundable_amount's
// missing EXECUTE grant.
export type ServiceRoleClient = SupabaseClient<Database> & {
  readonly __brand: "service-role";
};
