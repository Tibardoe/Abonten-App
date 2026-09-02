// Moved to @abonten/services so the shared service layer and the web app use
// one service-role factory. This re-export keeps the ~12 existing
// `@/config/supabase/serviceClient` import sites working unchanged. See that
// module for the full "never import into a client component" warning.
export { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
