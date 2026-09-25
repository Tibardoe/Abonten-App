// The production Supabase project, named so a deployment can refuse to run
// against it when it is not the production deployment.
//
// Preview and development deployments on Vercel used to receive the
// production database's URL and service-role key (one variable ticked for
// every target), so a branch preview could write production data. Since
// 2026-09-25 they use the "Abonten Preview" project, and this check makes
// the old situation impossible to recreate by ticking a box: a non-
// production deployment whose Supabase URL is the production project does
// not start. The reference is public (it is in every client bundle).

export const PRODUCTION_SUPABASE_REF = "sderrexhawjbmsugndcq";

/**
 * Why this deployment must not start, or null: it is a Vercel preview or
 * development deployment (VERCEL_ENV set and not "production") pointed at
 * the production database.
 */
export function productionDatabaseOffProductionProblem(
  env: Record<string, string | undefined>,
): string | null {
  const deployment = env.VERCEL_ENV?.trim();
  if (!deployment || deployment === "production") return null;
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return host.startsWith(`${PRODUCTION_SUPABASE_REF}.`)
    ? `[env] a ${deployment} deployment must not use the production database (${PRODUCTION_SUPABASE_REF}); point NEXT_PUBLIC_SUPABASE_URL at the preview project`
    : null;
}
