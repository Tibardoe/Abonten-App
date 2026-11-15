"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireDiscoveryUser } from "@/utils/discoveryAction";
import { readActingTeamId } from "@/utils/teamActor";
import { getActingTeamsCore } from "@abonten/services/teams/actingAccount";

/**
 * What the Manage menu needs: the teams the person can manage as and which
 * one is chosen (null = their own account). A chosen team the person is no
 * longer in reads as their own account.
 */
export const getActingContext = withActionLocale(
  async function getActingContext() {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const [acting, chosen] = await Promise.all([
      getActingTeamsCore(caller.svc, caller.userId),
      readActingTeamId(),
    ]);
    const { teams, programEnabled } = acting.data;
    const current = teams.find((t) => t.id === chosen) ?? null;
    return {
      status: 200 as const,
      data: { teams, current, programEnabled },
    };
  },
);
