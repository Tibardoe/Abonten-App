import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { NotificationData } from "@abonten/types/notificationType";
import { actingUserId, chooseActingTeam, getActingTeamId } from "./actingTeam";

/**
 * A notice about a team's listing or money (a member's copy carries the
 * team) opens managing as that team, as long as the person still runs it.
 * Best-effort: on any failure the screen opens as it would have.
 */
export async function manageAsNoticeTeam(
  data: NotificationData | null | undefined,
): Promise<void> {
  const teamId = data?.team_id;
  const userId = actingUserId();
  if (!teamId || !userId || getActingTeamId() === teamId) return;
  try {
    const res = await api.teams.acting();
    if (res.status !== 200 || !res.data) return;
    const team = res.data.teams.find((t) => t.id === teamId);
    if (!team) return;
    chooseActingTeam(userId, {
      teamId: team.id,
      name: team.name,
      role: team.role,
    });
    await Promise.all([
      queryClient.resetQueries({ queryKey: ["mobile", "organizer"] }),
      queryClient.resetQueries({ queryKey: ["mobile", "messaging"] }),
    ]);
  } catch {
    // Opens as the person; the screen says what they can do there.
  }
}
