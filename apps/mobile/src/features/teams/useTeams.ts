import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import type { InviteTarget, TeamRoleCode } from "@abonten/types/teamType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Team accounts for the app (docs/architecture/team-accounts.md).
// Everything goes through /api/mobile/teams (the tables are service-role
// only). Keys carry the signed-in user, and none is in the persisted-query
// allowlist: membership changes who may act for a business, so it is never
// shown from a stale cache file.

export const TEAMS_KEY = ["mobile", "teams"] as const;

function useUserId(): string | null {
  const { session } = useSession();
  return session?.user.id ?? null;
}

/** The person's teams, the invitations waiting for them, and the switch. */
export function useTeamsOverview(options: { staleTime?: number } = {}) {
  const userId = useUserId();
  return useQuery({
    queryKey: [...TEAMS_KEY, "overview", userId],
    enabled: !!userId,
    queryFn: async () => settleEnvelope(await api.teams.overview()),
    staleTime: options.staleTime ?? 15_000,
  });
}

export function useTeam(teamId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: [...TEAMS_KEY, "team", userId, teamId],
    enabled: !!userId && !!teamId,
    queryFn: async () => settleEnvelope(await api.teams.get(teamId)),
    staleTime: 10_000,
  });
}

function useInvalidateTeams() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: TEAMS_KEY });
}

/** A mutation whose success refreshes every team query. */
function useTeamMutation<V, R extends { status: number }>(
  fn: (vars: V) => Promise<R>,
) {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      if (res.status === 200) invalidate();
    },
  });
}

export const useCreateTeam = () =>
  useTeamMutation((body: { name: string; username: string }) =>
    api.teams.create(body),
  );

export const useRenameTeam = () =>
  useTeamMutation((v: { teamId: string; name: string }) =>
    api.teams.rename(v.teamId, v.name),
  );

export const useFindTeamInvitee = () =>
  useMutation({
    mutationFn: (v: { teamId: string; target: InviteTarget }) =>
      api.teams.invitee(v.teamId, v.target),
  });

export const useInviteTeamMember = () =>
  useTeamMutation(
    (v: { teamId: string; role: TeamRoleCode; target: InviteTarget }) =>
      api.teams.invite(v.teamId, { role: v.role, target: v.target }),
  );

export const useAnswerTeamInvite = () =>
  useTeamMutation((v: { inviteId: string; action: "accept" | "decline" }) =>
    api.teams.answerInvite(v.inviteId, v.action),
  );

export const useCancelTeamInvite = () =>
  useTeamMutation((inviteId: string) => api.teams.cancelInvite(inviteId));

export const useSetTeamMemberRole = () =>
  useTeamMutation((v: { teamId: string; userId: string; role: TeamRoleCode }) =>
    api.teams.setRole(v.teamId, v.userId, v.role),
  );

export const useRemoveTeamMember = () =>
  useTeamMutation((v: { teamId: string; userId: string }) =>
    api.teams.removeMember(v.teamId, v.userId),
  );

export const useLeaveTeam = () =>
  useTeamMutation((teamId: string) => api.teams.leave(teamId));
