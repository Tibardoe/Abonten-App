import { createClient } from "@/config/supabase/server";
import SwitchToTeamPrompt from "@/teams/molecules/SwitchToTeamPrompt";
import { actingFor } from "@/utils/teamActor";
import type { ReactNode } from "react";

/**
 * Finances while managing as a team: only Owners and Finance see the
 * team's money. Anyone else is told so (instead of seeing a balance the
 * page could not read) and can switch back to their own account.
 */
export default async function TeamMoneyGate({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return children;
  const actor = await actingFor(user.id, ["money.view", "payout.view"]);
  if (!actor.error) return children;
  return (
    <SwitchToTeamPrompt
      target={{ kind: "own" }}
      message={actor.error.message}
    />
  );
}
