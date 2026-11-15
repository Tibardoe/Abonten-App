import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadTicketTransferSettings, loadTicketTransfers } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import type { TicketTransferStatus } from "@abonten/types/ticketTransferType";
import Link from "next/link";
import { TicketTransferSettingsForm } from "./TicketTransferSettingsForm";

// Admin › Ticket transfers (docs/admin/ticket-transfers.md): the programme
// switches, and the offers people made so support can answer "where did my
// ticket go?". The console is English-only.

const STATUS: Record<
  TicketTransferStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" }
> = {
  pending: { label: "Waiting", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Ended", tone: "neutral" },
  expired: { label: "Ran out", tone: "warning" },
};

const ENDED: Record<string, string> = {
  sender: "the sender took it back",
  ticket_changed: "the ticket was checked in or cancelled",
  restricted: "an account was restricted",
};

export default async function TicketTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; user?: string }>;
}) {
  await requirePermissionPage("transfers.view");
  const { ticket, user } = await searchParams;
  const [{ ctx, settings }, { list }] = await Promise.all([
    loadTicketTransferSettings(),
    loadTicketTransfers({ ticket: ticket ?? null, userId: user ?? null }),
  ]);
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ticket transfers"
        description="People sending tickets to friends. A ticket moves only when the receiver accepts, and then gets a new code."
      />

      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <TicketTransferSettingsForm
          settings={settings.data.settings}
          killSwitch={settings.data.killSwitch}
          canConfigure={ctx.permissions.includes("transfers.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}

      <Card className="space-y-3 p-4">
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-sm">
            <span className="block font-medium">Ticket code or id</span>
            <input
              name="ticket"
              defaultValue={ticket ?? ""}
              className="mt-1 w-72 rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block font-medium">User id</span>
            <input
              name="user"
              defaultValue={user ?? ""}
              className="mt-1 w-80 rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-border px-3 py-1.5 text-sm"
          >
            Search
          </button>
          {ticket || user ? (
            <Link href="/ticket-transfers" className="text-sm underline">
              Clear
            </Link>
          ) : null}
        </form>

        {list.status !== 200 || !list.data ? (
          <EmptyState>
            {list.message ?? "Couldn't load the transfers."}
          </EmptyState>
        ) : list.data.length === 0 ? (
          <EmptyState>No transfers.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Made</th>
                  <th className="py-2 pr-3">Answered</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS[row.status].tone}>
                        {STATUS[row.status].label}
                      </Badge>
                      {row.cancelReason ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {ENDED[row.cancelReason] ?? row.cancelReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/events/${row.eventId}`}
                        className="underline"
                      >
                        {row.eventTitle ?? row.eventId.slice(0, 8)}
                      </Link>
                      <Link
                        href={`/ticket-transfers?ticket=${row.ticketId}`}
                        className="mt-1 block font-mono text-xs text-muted-foreground"
                      >
                        ticket {row.ticketId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/users/${row.from.id}`}
                        className="underline"
                      >
                        {row.from.label}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {row.to ? (
                        <Link
                          href={`/users/${row.to.id}`}
                          className="underline"
                        >
                          {row.to.label}
                        </Link>
                      ) : (
                        <span>
                          number ending {row.toPhoneEnding}
                          {row.textSent ? " (texted)" : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {timeAgo(row.createdAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {row.decidedAt ? timeAgo(row.decidedAt) : "—"}
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
