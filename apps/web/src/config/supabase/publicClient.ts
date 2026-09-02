// Moved to @abonten/services so the shared service layer and the web app use
// one cookie-free anon factory for public, unauthenticated reads. This
// re-export keeps the existing `@/config/supabase/publicClient` import sites
// working unchanged. See that module for when it is (and isn't) safe to use.
export { publicSupabase } from "@abonten/services/supabase/publicClient";
