import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { type TeamCapability, teamRoleCan } from "@abonten/core/teams/roles";
import type {
  InviteTarget,
  TeamProfilePatch,
  TeamRoleCode,
} from "@abonten/types/teamType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import {
  type ActingChoice,
  chooseActingTeam,
  useActingChoice,
} from "./actingTeam";

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

/** `adult`: they say they are 18 or older (K7). */
export const useCreateTeam = () =>
  useTeamMutation(
    (body: {
      name: string;
      username: string;
      adult: true;
      termsVersion?: string | null;
    }) => api.teams.create(body),
  );

/** "Make this a team": the person's organizer work moves to a new team. */
export const useConvertAccountToTeam = () =>
  useTeamMutation(
    (body: { name: string; adult: true; termsVersion?: string | null }) =>
      api.teams.convert(body),
  );

/** An Owner accepts the published team terms for the team (N4). */
export const useAcceptTeamTerms = () =>
  useTeamMutation((v: { teamId: string; termsVersion: string }) =>
    api.teams.acceptTerms(v.teamId, v.termsVersion),
  );

export const useRenameTeam = () =>
  useTeamMutation((v: { teamId: string; name: string }) =>
    api.teams.rename(v.teamId, v.name),
  );

/** An Owner changes the team's username, bio, website or social links. */
export const useUpdateTeamProfile = () =>
  useTeamMutation((v: { teamId: string; patch: TeamProfilePatch }) =>
    api.teams.updateProfile(v.teamId, v.patch),
  );

/** Saves a photo uploaded with the team's signature (its own folder). */
export const useSaveTeamPhoto = () =>
  useTeamMutation(
    (v: {
      teamId: string;
      publicId: string;
      version: number;
      transformation: string | null;
    }) =>
      api.teams.savePhoto(v.teamId, {
        publicId: v.publicId,
        version: v.version,
        transformation: v.transformation,
      }),
  );

/**
 * Deleting a team (every Owner agrees): ask, approve, stop. A 200 whose
 * `data.state` is "deleted" means the team is gone.
 */
export const useRequestTeamDeletion = () =>
  useTeamMutation((v: { teamId: string; confirmName: string }) =>
    api.teams.requestDeletion(v.teamId, v.confirmName),
  );

export const useApproveTeamDeletion = () =>
  useTeamMutation((v: { teamId: string; requestId: string }) =>
    api.teams.approveDeletion(v.teamId, v.requestId),
  );

export const useCancelTeamDeletion = () =>
  useTeamMutation((v: { teamId: string; requestId: string }) =>
    api.teams.cancelDeletion(v.teamId, v.requestId),
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

/** Joining says they are 18 or older (K7). */
export const useAnswerTeamInvite = () =>
  useTeamMutation(
    (v: { inviteId: string; action: "accept" | "decline"; adult?: boolean }) =>
      api.teams.answerInvite(v.inviteId, v.action, v.adult),
  );

/** An Owner limits a Front desk or Door staff member to some places. */
export const useSetTeamMemberPlaces = () =>
  useTeamMutation((v: { teamId: string; userId: string; placeIds: string[] }) =>
    api.teams.setMemberPlaces(v.teamId, v.userId, v.placeIds),
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

/** Everything the organizer screens show or fetch for an account. */
const ORGANIZER_KEY = ["mobile", "organizer"] as const;
/** The inbox follows "Managing as" too (a team's, for those who answer it). */
const MESSAGING_KEY = ["mobile", "messaging"] as const;
const PROMOTION_CREDIT_KEY = ["mobile", "rewards", "promotion-credit"] as const;
const CONTENT_KEY_PREFIX = ["mobile", "content"] as const;

/** Forgets what was read for the previous account. */
export function resetAccountQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.resetQueries({ queryKey: ORGANIZER_KEY });
  void qc.resetQueries({ queryKey: MESSAGING_KEY });
  // The promotion credit shown on Finances is the managed account's.
  void qc.resetQueries({ queryKey: PROMOTION_CREDIT_KEY });
  // A post, its comments' remove buttons and its insights depend on whose
  // posts the person manages (stage 4c).
  void qc.resetQueries({ queryKey: [...CONTENT_KEY_PREFIX, "post"] });
  void qc.resetQueries({ queryKey: [...CONTENT_KEY_PREFIX, "insights"] });
  void qc.resetQueries({ queryKey: [...CONTENT_KEY_PREFIX, "comments"] });
}

/**
 * "Managing as": the teams the person may manage as, the one chosen, and
 * what its role covers. `can()` is true for every capability on the
 * person's own account. A chosen team the person is no longer in (or that
 * was paused) falls back to their own account.
 */
export function useActingTeams() {
  const userId = useUserId();
  const choice = useActingChoice();
  const q = useQuery({
    queryKey: [...TEAMS_KEY, "acting", userId],
    enabled: !!userId,
    queryFn: async () => settleEnvelope(await api.teams.acting()),
    staleTime: 30_000,
  });
  const loaded = q.data?.status === 200 ? q.data.data : null;
  const teams = loaded?.teams ?? [];
  const fresh = choice ? teams.find((t) => t.id === choice.teamId) : null;
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId || !choice || !loaded) return;
    if (!fresh) {
      chooseActingTeam(userId, null);
      resetAccountQueries(qc);
    } else if (fresh.role !== choice.role || fresh.name !== choice.name) {
      chooseActingTeam(userId, {
        teamId: fresh.id,
        name: fresh.name,
        role: fresh.role,
      });
    }
  }, [userId, choice, loaded, fresh, qc]);

  const can = useCallback(
    (...caps: TeamCapability[]) =>
      !choice || caps.some((c) => teamRoleCan(choice.role, c)),
    [choice],
  );

  return {
    teams,
    current: choice,
    role: choice?.role ?? null,
    can,
    programEnabled: loaded?.programEnabled ?? false,
    /** The read has answered (or failed): `teams` is not just a default. */
    loaded: !!userId && !q.isPending,
  };
}

/** Switches "Managing as" and reloads every organizer screen's data. */
export function useSwitchActingTeam() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useCallback(
    (choice: ActingChoice | null) => {
      if (!userId) return;
      chooseActingTeam(userId, choice);
      resetAccountQueries(qc);
    },
    [userId, qc],
  );
}
