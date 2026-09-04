import {
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { loadAudit } from "@/lib/data";
import Link from "next/link";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const res = await loadAudit({
    action: sp.action,
    actorId: sp.actor,
    targetType: sp.targetType,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Append-only record of every sensitive administrative action."
      />
      <form className="mb-3 flex gap-2" action="/audit">
        <input
          name="action"
          defaultValue={sp.action ?? ""}
          placeholder="Filter by action (e.g. report.resolve)"
          className="h-9 w-72 rounded-md border border-border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
      </form>

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load the audit log."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No audit entries yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Summary</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((e) => (
              <tr key={e.id} className="hover:bg-muted/40">
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(e.createdAt)}
                </Td>
                <Td>
                  {e.actorName ??
                    (e.actorId ? `${e.actorId.slice(0, 8)}…` : "system")}
                  {e.actorRoles.length ? (
                    <div className="text-xs text-muted-foreground">
                      {e.actorRoles.join(", ")}
                    </div>
                  ) : null}
                </Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td className="text-xs">
                  {e.targetType}
                  {e.targetId ? (
                    <>
                      {" "}
                      {e.targetType === "report" ? (
                        <Link
                          href={`/reports/${e.targetId}`}
                          className="text-primary hover:underline"
                        >
                          {e.targetId.slice(0, 8)}…
                        </Link>
                      ) : e.targetType === "user" ? (
                        <Link
                          href={`/users/${e.targetId}`}
                          className="text-primary hover:underline"
                        >
                          {e.targetId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {e.targetId.slice(0, 8)}…
                        </span>
                      )}
                    </>
                  ) : null}
                </Td>
                <Td>
                  {e.summary}
                  {e.reason ? (
                    <div className="text-xs text-muted-foreground">
                      reason: {e.reason}
                    </div>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/audit?cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
