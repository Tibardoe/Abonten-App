import {
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadTicketPlanList } from "@/lib/data";
import Link from "next/link";
import {
  TicketPlanTabs,
  minor,
  planStatusBadge,
  refundBadge,
} from "./planStatus";

// Admin › Pay small small: every plan, the money plans hold (the buyers'
// cash on its way to a ticket, not a sale yet), the fee share kept on plans
// that ended unfinished, and refunds that need a person.

type Params = Record<string, string | string[] | undefined>;

function hrefWith(
  params: Params,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && !(k in changes) && k !== "before")
      next.set(k, v);
  }
  for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v);
  const qs = next.toString();
  return `/ticket-plans${qs ? `?${qs}` : ""}`;
}

function FilterLink({
  params,
  name,
  value,
  label,
}: {
  params: Params;
  name: "status" | "refund";
  value: string | null;
  label: string;
}) {
  const current = typeof params[name] === "string" ? params[name] : null;
  const other = name === "status" ? "refund" : "status";
  const active =
    current === value && (value !== null || typeof params[other] !== "string");
  return (
    <Link
      href={hrefWith(params, { [name]: value, [other]: null })}
      aria-current={active ? "page" : undefined}
      className={`rounded border px-2 py-1 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
    >
      {label}
    </Link>
  );
}

export default async function TicketPlansPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requirePermissionPage("plans.view");
  const params = await searchParams;
  const { list } = await loadTicketPlanList(params);
  const rows = list.data?.rows ?? [];
  const totals = list.data?.totals ?? [];
  const last = rows.at(-1);

  return (
    <div>
      <PageHeader
        title="Pay small small"
        description="Buyers paying for an event's tickets in parts before the event. Money on running plans is the buyers', not a sale yet: it becomes the purchase when a plan is finished, or goes back when it ends."
      />
      <TicketPlanTabs active="/ticket-plans" />

      {totals.length > 0 ? (
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {totals.map((t) => (
            <div key={t.currency} className="contents">
              <Stat
                label={`Held on running plans (${t.currency})`}
                value={minor(t.heldMinor, t.currency)}
              />
              <Stat
                label={`Fee share kept on ended plans (${t.currency})`}
                value={minor(t.keptMinor, t.currency)}
                hint="Not in the platform fee records: no sale took place."
              />
              <Stat
                label={`Refunds under way (${t.currency})`}
                value={minor(t.refundingMinor, t.currency)}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterLink params={params} name="status" value={null} label="All" />
        <FilterLink
          params={params}
          name="refund"
          value="failed"
          label="Refund needs staff"
        />
        <FilterLink
          params={params}
          name="refund"
          value="pending"
          label="Refund pending"
        />
        <FilterLink
          params={params}
          name="status"
          value="active"
          label="Paying"
        />
        <FilterLink
          params={params}
          name="status"
          value="awaiting_payment"
          label="Waiting for first part"
        />
        <FilterLink
          params={params}
          name="status"
          value="settling"
          label="Issuing tickets"
        />
        <FilterLink
          params={params}
          name="status"
          value="completed"
          label="Completed"
        />
        <FilterLink
          params={params}
          name="status"
          value="lapsed"
          label="Lapsed"
        />
        <FilterLink
          params={params}
          name="status"
          value="cancelled"
          label="Cancelled"
        />
      </div>

      {list.status !== 200 || !list.data ? (
        <EmptyState>{list.message ?? "Couldn't load the plans."}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>No plans match.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Buyer</Th>
                <Th>Event</Th>
                <Th>State</Th>
                <Th>Paid / total</Th>
                <Th>Deadline</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      href={`/ticket-plans/${r.id}`}
                      className="underline underline-offset-2"
                    >
                      {timeAgo(r.createdAt)}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/users/${r.userId}`}
                      className="underline underline-offset-2"
                    >
                      {r.username ? `@${r.username}` : r.userId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/events/${r.eventId}`}
                      className="underline underline-offset-2"
                    >
                      {r.eventTitle || r.eventId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {planStatusBadge(r.status)}
                      {refundBadge(r.refundStatus)}
                    </span>
                  </Td>
                  <Td className="tabular-nums">
                    {minor(r.paidMinor, r.currency)} /{" "}
                    {minor(r.totalMinor, r.currency)}
                  </Td>
                  <Td>{new Date(r.deadlineAt).toUTCString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length >= 50 && last ? (
            <div className="mt-3">
              <Link
                className="text-sm underline underline-offset-2"
                href={hrefWith(params, { before: last.createdAt })}
              >
                Older plans
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
