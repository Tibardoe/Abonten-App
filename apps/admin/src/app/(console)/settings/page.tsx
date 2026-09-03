import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { StepUpButton } from "@/components/StepUpButton";
import { loadSettings } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { RoleEditor } from "./RoleEditor";

export default async function SettingsPage() {
  const { ctx, staff, matrix } = await loadSettings();
  const stepUpFresh =
    !!ctx.reauthenticatedAt && Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const canManage = ctx.permissions.includes("admins.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Settings"
        description="Roles, permissions and admin staff. Changes here are audited."
        actions={canManage ? <StepUpButton /> : undefined}
      />

      {canManage && !stepUpFresh && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
          Managing admins needs a fresh re-authentication. Click <strong>Confirm identity</strong>{" "}
          above, then return here.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Admin staff</h2>
        {staff.status !== 200 || !staff.data ? (
          <EmptyState>{staff.message ?? "Couldn't load admin staff."}</EmptyState>
        ) : staff.data.length === 0 ? (
          <EmptyState>
            No admin accounts yet. Grant the first <code>super_admin</code> role directly in the
            database, then manage the rest here.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {staff.data.map((s) => (
                <tr key={s.userId} className="hover:bg-muted/40">
                  <Td>
                    <span className="font-medium">
                      {s.fullName ?? s.username ?? `${s.userId.slice(0, 8)}…`}
                    </span>
                    {s.email ? (
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={s.status === "active" ? "success" : "neutral"}>{s.status}</Badge>
                  </Td>
                  <Td className="text-xs">{s.roles.join(", ") || "—"}</Td>
                  {canManage && (
                    <Td>
                      <RoleEditor
                        userId={s.userId}
                        currentRoles={s.roles}
                        status={s.status}
                        isSelf={s.userId === ctx.userId}
                        disabled={!stepUpFresh}
                      />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Role → permission matrix</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {matrix.status === 200 && matrix.data
            ? Object.entries(matrix.data).map(([role, perms]) => (
                <Card key={role} className="p-3">
                  <p className="font-medium">{role}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {perms.length} permission(s)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {perms.map((p) => (
                      <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {p}
                      </span>
                    ))}
                  </div>
                </Card>
              ))
            : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The matrix is defined in code (<code>@abonten/core/adminPermissions</code>) and seeded into
          the database. Editing it is a code change + migration, not a runtime toggle in Phase 1.
        </p>
      </section>
    </div>
  );
}
