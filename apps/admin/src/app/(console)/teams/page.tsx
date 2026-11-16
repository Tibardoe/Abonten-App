import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadTeamSettings, loadTeams } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { TeamSettingsForm } from "./TeamSettingsForm";

// Admin › Teams (docs/admin/teams.md): the programme switches and limits,
// and every team with its Owners, so support can answer "who runs this
// organizer?". The console is English-only.

const STATUS = {
  active: { label: "Active", tone: "success" },
  frozen: { label: "Paused", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
} as const;

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePermissionPage("teams.view");
  const { q } = await searchParams;
  const [{ ctx, settings }, { list }] = await Promise.all([
    loadTeamSettings(),
    loadTeams({ q: q ?? null }),
  ]);
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Organizers and places run by several people, each with their own account and a role: who runs a team, its members and activity, and the programme switches. Opening to everyone waits on the team terms and counsel (N4, N5, N9, K7)."
      />

      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <TeamSettingsForm
          settings={settings.data.settings}
          killSwitch={settings.data.killSwitch}
          readiness={settings.data.readiness}
          canConfigure={ctx.permissions.includes("teams.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}

      <Card className="space-y-3 p-4">
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-sm">
            <span className="block font-medium">Team name or username</span>
            <input
              name="q"
              defaultValue={q ?? ""}
              className="mt-1 w-80 rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-border px-3 py-1.5 text-sm"
          >
            Search
          </button>
          {q ? (
            <Link href="/teams" className="text-sm underline">
              Clear
            </Link>
          ) : null}
        </form>

        {list.status !== 200 || !list.data ? (
          <EmptyState>{list.message ?? "Couldn't load the teams."}</EmptyState>
        ) : list.data.length === 0 ? (
          <EmptyState>No teams.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Owners</th>
                  <th className="py-2 pr-3">Members</th>
                  <th className="py-2 pr-3">Made</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/teams/${row.id}`} className="underline">
                        {row.name ?? row.username ?? row.id.slice(0, 8)}
                      </Link>
                      {row.username ? (
                        <span className="block text-xs text-muted-foreground">
                          @{row.username}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS[row.status].tone}>
                        {STATUS[row.status].label}
                      </Badge>
                      {row.statusReason ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {row.statusReason === "no_owner"
                            ? "no Owner left"
                            : row.statusReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      {row.owners.length === 0
                        ? "—"
                        : row.owners.map((o) => (
                            <Link
                              key={o.id}
                              href={`/users/${o.id}`}
                              className="block underline"
                            >
                              {o.name ?? o.username ?? o.id.slice(0, 8)}
                            </Link>
                          ))}
                    </td>
                    <td className="py-2 pr-3">{row.memberCount}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {timeAgo(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
