import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadTeam } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { TeamStaffActions } from "./TeamStaffActions";

// Admin › Teams › one team: who runs it, in which role, and what each
// member did; with teams.manage, staff pause it in a dispute, resume it and
// make a current or former member an Owner. The console is English-only.

const ROLE: Record<string, string> = {
  owner: "Owner",
  finance: "Finance",
  manager: "Manager",
  content: "Content and messages",
  door: "Door staff",
  front_desk: "Front desk",
};

type Named = { id: string; name: string | null; username: string | null };

const nameOf = (p: Named | null) =>
  p ? (p.name ?? p.username ?? p.id.slice(0, 8)) : "Former member";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requirePermissionPage("teams.view");
  const { teamId } = await params;
  const { ctx, team } = await loadTeam(teamId);
  if (team.status !== 200 || !team.data) {
    return <EmptyState>{team.message ?? "Couldn't load the team."}</EmptyState>;
  }
  const { team: row, members, formerMembers, activity, deleted } = team.data;
  const canManage = ctx.permissions.includes("teams.manage");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const candidates = [
    ...members
      .filter((m) => m.role !== "owner")
      .map((m) => ({
        person: m.person,
        current: true,
        role: ROLE[m.role] ?? m.role,
      })),
    ...formerMembers.map((m) => ({
      person: m.person,
      current: false,
      role: ROLE[m.role] ?? m.role,
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          deleted
            ? `${deleted.name ?? deleted.username ?? "Team"} (deleted)`
            : (row.name ?? row.username ?? "Team")
        }
        description={
          deleted
            ? deleted.username
              ? `was @${deleted.username}`
              : undefined
            : row.username
              ? `@${row.username}`
              : undefined
        }
      />
      <Card className="space-y-2 p-4 text-sm">
        <p>
          <Badge
            tone={
              row.status === "active"
                ? "success"
                : row.status === "frozen"
                  ? "warning"
                  : "neutral"
            }
          >
            {row.status === "active"
              ? "Active"
              : row.status === "frozen"
                ? "Paused"
                : "Deleted"}
          </Badge>
          {deleted
            ? deleted.by === "staff"
              ? ` · deleted by Abonten staff${deleted.at ? ` ${timeAgo(deleted.at)}` : ""} (see the audit log)`
              : ` · deleted by its Owners${deleted.at ? ` ${timeAgo(deleted.at)}` : ""}`
            : null}
          {row.status === "closed"
            ? null
            : row.statusReason === "no_owner"
              ? " · no Owner left"
              : row.statusReason === "dispute"
                ? " · paused for a dispute"
                : row.statusReason === "staff"
                  ? " · paused by staff"
                  : null}
        </p>
        <p>
          Made {timeAgo(row.createdAt)}
          {row.createdBy ? (
            <>
              {" by "}
              <Link href={`/users/${row.createdBy.id}`} className="underline">
                {nameOf(row.createdBy)}
              </Link>
            </>
          ) : null}
          {" · "}
          <Link href={`/users/${row.id}`} className="underline">
            team account
          </Link>
        </p>
      </Card>

      {canManage && row.status !== "closed" ? (
        <TeamStaffActions
          teamId={row.id}
          teamName={row.name ?? row.username ?? "this team"}
          status={row.status}
          hasOwner={row.owners.length > 0}
          candidates={candidates}
          stepUpFresh={stepUpFresh}
        />
      ) : null}

      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold">Members ({members.length})</p>
        {members.length === 0 ? (
          <EmptyState>No members.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {members.map((m) => (
                <tr key={m.person.id} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <Link href={`/users/${m.person.id}`} className="underline">
                      {nameOf(m.person)}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{ROLE[m.role] ?? m.role}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                    joined {timeAgo(m.joinedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold">Activity</p>
        {activity.length === 0 ? (
          <EmptyState>Nothing yet.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {activity.map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                    {timeAgo(a.createdAt)}
                  </td>
                  <td className="py-2 pr-3">
                    {a.actor ? nameOf(a.actor) : "System"}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{a.action}</td>
                  <td className="py-2 pr-3">
                    {a.subject ? nameOf(a.subject) : null}
                    {Object.keys(a.details).length > 0 ? (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {JSON.stringify(a.details)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
