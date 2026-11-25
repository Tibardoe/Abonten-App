import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadGatePartnerLinks } from "@/lib/data";
import { GATE_PUSH_STATUS_TEXT } from "@abonten/core/admin/gatePartnerText";
import { gatePartnerName } from "@abonten/core/gatePartners/gateLinkRules";
import Link from "next/link";
import { redirect } from "next/navigation";

// Admin › Gate partners (docs/admin/gate-partners.md): events whose tickets
// are checked in by the organizer's own gate system (Hapniin), the sales
// registered with it, and the ones that need a person. English-only.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GatePartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requirePermissionPage("gatepartners.view");
  const { event } = await searchParams;
  if (event && UUID.test(event.trim())) {
    redirect(`/gate-partners/${event.trim()}`);
  }
  const { links, stuck } = await loadGatePartnerLinks();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate partners"
        description="Events whose gate is run by the organizer's own check-in system. Abonten sells the tickets, registers each sale with the partner, and shows the partner's code on the ticket."
      />

      {links.data?.killSwitch ? (
        <Card className="border-destructive p-3 text-sm">
          GATE_PARTNERS_KILL_SWITCH is on: linked events are not on sale and no
          sale is sent to a partner until it is removed.
        </Card>
      ) : null}

      <Card className="space-y-2 p-4">
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-sm">
            <span className="block font-medium">
              Link or open an event (event id)
            </span>
            <input
              name="event"
              defaultValue={event ?? ""}
              className="mt-1 w-96 rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Open
          </button>
        </form>
        {event && !UUID.test(event.trim()) ? (
          <p className="text-sm text-destructive">That is not an event id.</p>
        ) : null}
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sales that need a person</h2>
        {stuck.status !== 200 ? (
          <EmptyState>{stuck.message ?? "Couldn't load them."}</EmptyState>
        ) : (stuck.data ?? []).length === 0 ? (
          <EmptyState>Nothing is stuck.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sale</Th>
                <Th>State</Th>
                <Th>Tries</Th>
                <Th>Last error</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {(stuck.data ?? []).map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link
                      className="font-mono text-xs underline"
                      href={`/gate-partners/${p.eventId}`}
                    >
                      {p.id.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={p.status === "failed" ? "danger" : "warning"}>
                      {GATE_PUSH_STATUS_TEXT[p.status] ?? p.status}
                    </Badge>
                  </Td>
                  <Td>{p.attempts}</Td>
                  <Td className="max-w-md text-xs">
                    {p.lastErrorCode ? (
                      <span className="font-mono">{p.lastErrorCode}</span>
                    ) : null}{" "}
                    {p.lastErrorDetail ?? ""}
                  </Td>
                  <Td>{timeAgo(p.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Linked events</h2>
        {links.status !== 200 ? (
          <EmptyState>{links.message ?? "Couldn't load the links."}</EmptyState>
        ) : (links.data?.links ?? []).length === 0 ? (
          <EmptyState>No event is linked to a gate partner.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>Partner event</Th>
                <Th>Status</Th>
                <Th>Sales</Th>
                <Th>To void</Th>
                <Th>Checked</Th>
              </tr>
            </thead>
            <tbody>
              {(links.data?.links ?? []).map((l) => (
                <tr key={l.eventId}>
                  <Td>
                    <Link
                      className="underline"
                      href={`/gate-partners/${l.eventId}`}
                    >
                      {l.eventTitle || l.eventId}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {gatePartnerName(l.provider)} ·{" "}
                    {l.partnerEventTitle ?? l.partnerEventId}{" "}
                    <Badge tone={l.keyMode === "live" ? "success" : "warning"}>
                      {l.keyMode}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={l.status === "active" ? "success" : "warning"}>
                      {l.status === "active" ? "Selling" : "Paused"}
                    </Badge>
                  </Td>
                  <Td className="text-xs">
                    {Object.entries(l.pushes)
                      .map(
                        ([status, n]) =>
                          `${GATE_PUSH_STATUS_TEXT[status] ?? status}: ${n}`,
                      )
                      .join(" · ") || "None yet"}
                  </Td>
                  <Td>{l.toVoid}</Td>
                  <Td className="text-xs">
                    {timeAgo(l.checkedAt)}
                    {l.checkProblems.length > 0 ? (
                      <span className="block text-destructive">
                        {l.checkProblems.length} note(s)
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
