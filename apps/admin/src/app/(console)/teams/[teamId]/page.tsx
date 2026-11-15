import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadTeam } from "@/lib/data";
import Link from "next/link";

// Admin › Teams › one team: who runs it, in which role, and what each
// member did. Read-only in stage 1 (staff settle disputes and paused teams
// in stage 5). The console is English-only.

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
  const { team } = await loadTeam(teamId);
  if (team.status !== 200 || !team.data) {
    return <EmptyState>{team.message ?? "Couldn't load the team."}</EmptyState>;
  }
  const { team: row, members, activity } = team.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.name ?? row.username ?? "Team"}
        description={row.username ? `@${row.username}` : undefined}
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
                : "Closed"}
          </Badge>
          {row.statusReason === "no_owner" ? " · no Owner left" : null}
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
