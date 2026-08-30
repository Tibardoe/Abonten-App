import { getUserTransactionDetail } from "@/actions/getUserTransactionDetail";
import TransactionStatusIcon, {
  getTransactionStatusMeta,
} from "@/components/atoms/TransactionStatusIcon";
import type { TransactionKind, TransactionStatus } from "@/types/transactions";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { getRefundStatusLabel } from "@/utils/refundStatus";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

function DetailRow({
  label,
  value,
}: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between items-center">
      <p>{label}</p>
      <p>{value}</p>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;

  if (kind !== "ticket" && kind !== "subscription") {
    notFound();
  }

  const result = await getUserTransactionDetail(kind as TransactionKind, id);

  if (result.status === 404) {
    notFound();
  }

  const row = result.data as
    | ({
        status: TransactionStatus;
        unit_price: number;
        discount: number;
        total_price: number;
        serviceFee?: number;
        totalPaid?: number;
        created_at: string;
        expires_at: string | null;
        completed_at: string | null;
      } & (
        | {
            kind: "ticket";
            quantity: number;
            checkout_session_id: string | null;
            event: { title: string } | null;
            ticket_type: { type: string; currency: string | null } | null;
            tickets: {
              status: string;
              transaction: {
                status: string;
                refund_requested_at: string | null;
              } | null;
            }[];
          }
        | {
            kind: "subscription";
            subscription_plan_name: string | null;
          }
      ))
    | undefined;

  if (!row) {
    notFound();
  }

  const currency =
    row.kind === "ticket" ? (row.ticket_type?.currency ?? "GHS") : "GHS";
  const cancelledTickets =
    row.kind === "ticket"
      ? row.tickets.filter((t) => t.status === "cancelled")
      : [];
  // Every ticket from one checkout line shares the same transaction (see
  // generateTicket.ts), so the first cancelled ticket's refund status
  // speaks for all of them.
  const refundBadge =
    cancelledTickets.length > 0 && cancelledTickets[0].transaction
      ? getRefundStatusLabel(
          cancelledTickets[0].transaction.status,
          cancelledTickets[0].transaction.refund_requested_at,
        )
      : null;
  const { label: statusLabel } = getTransactionStatusMeta(row.status);
  const contextualDate =
    row.status === "paid"
      ? row.completed_at
      : row.status === "pending"
        ? row.expires_at
        : row.created_at;
  const contextualDateLabel =
    row.status === "paid"
      ? "Completed"
      : row.status === "pending"
        ? "Expires"
        : "Date";

  return (
    <div className="space-y-10 text-sm mb-5 md:mb-0 w-full">
      <div className="font-bold text-muted-foreground flex justify-between items-center bg-muted rounded-md p-5">
        <p>Amount</p>
        <p>
          {currency}{" "}
          {row.kind === "ticket" && typeof row.totalPaid === "number"
            ? row.totalPaid
            : row.total_price}
        </p>
      </div>

      <div className="flex gap-3 bg-muted rounded-md p-5 items-center">
        <TransactionStatusIcon
          status={row.status}
          className="text-2xl md:text-3xl"
        />
        <div>
          <p className="font-bold">{statusLabel}</p>
          {contextualDate && (
            <p className="text-muted-foreground text-xs">
              {contextualDateLabel}: {formatSingleDateTime(contextualDate).date}{" "}
              {formatSingleDateTime(contextualDate).time}
            </p>
          )}
        </div>
      </div>

      <div className="font-semibold text-muted-foreground bg-muted rounded-md p-5 space-y-5">
        {row.kind === "ticket" ? (
          <>
            <DetailRow label="Event" value={row.event?.title} />
            <DetailRow label="Ticket Type" value={row.ticket_type?.type} />
            <DetailRow label="Quantity" value={row.quantity} />
            <DetailRow
              label="Unit Price"
              value={`${currency} ${row.unit_price}`}
            />
            {row.discount > 0 && (
              <DetailRow
                label="Discount"
                value={`-${currency} ${row.discount}`}
              />
            )}
            <DetailRow
              label="Ticket Price"
              value={`${currency} ${row.total_price}`}
            />
            {typeof row.serviceFee === "number" && row.serviceFee > 0 && (
              <DetailRow
                label="Service fee"
                value={`${currency} ${row.serviceFee}`}
              />
            )}
            {typeof row.totalPaid === "number" &&
              row.totalPaid !== row.total_price && (
                <DetailRow
                  label="Total Paid"
                  value={`${currency} ${row.totalPaid}`}
                />
              )}
            <DetailRow
              label="Date/Time"
              value={`${formatSingleDateTime(row.created_at).date} ${formatSingleDateTime(row.created_at).time}`}
            />
            <DetailRow
              label="Order Reference"
              value={row.checkout_session_id ?? id}
            />
            {cancelledTickets.length > 0 && (
              <DetailRow
                label="Cancelled"
                value={`${cancelledTickets.length} of ${row.quantity}`}
              />
            )}
            {refundBadge && (
              <DetailRow
                label="Refund"
                value={
                  <span className={refundBadge.className}>
                    {refundBadge.label}
                  </span>
                }
              />
            )}
          </>
        ) : (
          <>
            <DetailRow label="Plan" value={row.subscription_plan_name} />
            <DetailRow
              label="Unit Price"
              value={`${currency} ${row.unit_price}`}
            />
            {row.discount > 0 && (
              <DetailRow
                label="Discount"
                value={`-${currency} ${row.discount}`}
              />
            )}
            <DetailRow
              label="Total Price"
              value={`${currency} ${row.total_price}`}
            />
            <DetailRow
              label="Date/Time"
              value={`${formatSingleDateTime(row.created_at).date} ${formatSingleDateTime(row.created_at).time}`}
            />
            <DetailRow label="Reference" value={id} />
          </>
        )}
      </div>
    </div>
  );
}
