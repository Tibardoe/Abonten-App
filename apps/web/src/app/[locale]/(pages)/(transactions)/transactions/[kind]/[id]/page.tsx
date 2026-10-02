import { getUserTransactionDetail } from "@/actions/getUserTransactionDetail";
import TransactionStatusIcon, {
  getTransactionStatusMeta,
} from "@/components/atoms/TransactionStatusIcon";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { getRefundStatusLabel } from "@abonten/core/refundStatus";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type {
  TransactionKind,
  TransactionStatus,
} from "@abonten/types/transactions";
import { getLocale, getTranslations } from "next-intl/server";
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
  const locale = await getLocale();

  const t = await getTranslations("transactions");
  const tCommon = await getTranslations("common");
  const tc = await getTranslations("core");

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
            currency: string | null;
          }
      ))
    | undefined;

  if (!row) {
    notFound();
  }

  const currency =
    (row.kind === "ticket" ? row.ticket_type?.currency : row.currency) ?? "";
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
          tc,
          cancelledTickets[0].transaction.status,
          cancelledTickets[0].transaction.refund_requested_at,
        )
      : null;
  const statusLabel = tCommon(getTransactionStatusMeta(row.status).labelKey);
  const contextualDate =
    row.status === "paid"
      ? row.completed_at
      : row.status === "pending"
        ? row.expires_at
        : row.created_at;
  const contextualDateLabel =
    row.status === "paid"
      ? t("completed")
      : row.status === "pending"
        ? t("expires")
        : t("date");

  return (
    <div className="space-y-10 text-sm mb-5 md:mb-0 w-full">
      <div className="font-bold text-muted-foreground flex justify-between items-center bg-muted rounded-md p-5">
        <p>{t("amount")}</p>
        <p>
          {formatMoney(
            currency,
            row.kind === "ticket" && typeof row.totalPaid === "number"
              ? row.totalPaid
              : row.total_price,
            { locale },
          )}
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
              {contextualDateLabel}:{" "}
              {formatSingleDateTime(contextualDate, undefined, locale).date}{" "}
              {formatSingleDateTime(contextualDate, undefined, locale).time}
            </p>
          )}
        </div>
      </div>

      <div className="font-semibold text-muted-foreground bg-muted rounded-md p-5 space-y-5">
        {row.kind === "ticket" ? (
          <>
            <DetailRow label={t("event")} value={row.event?.title} />
            <DetailRow
              label={t("ticketType")}
              value={ticketTypeLabel(tc, row.ticket_type?.type)}
            />
            <DetailRow label={t("quantity")} value={row.quantity} />
            <DetailRow
              label={t("unitPrice")}
              value={formatMoney(currency, row.unit_price, { locale })}
            />
            {row.discount > 0 && (
              <DetailRow
                label={t("discount")}
                value={`-${formatMoney(currency, row.discount, { locale })}`}
              />
            )}
            <DetailRow
              label={t("ticketPrice")}
              value={formatMoney(currency, row.total_price, { locale })}
            />
            {typeof row.serviceFee === "number" && row.serviceFee > 0 && (
              <DetailRow
                label={t("serviceFee")}
                value={formatMoney(currency, row.serviceFee, { locale })}
              />
            )}
            {typeof row.totalPaid === "number" &&
              row.totalPaid !== row.total_price && (
                <DetailRow
                  label={t("totalPaid")}
                  value={formatMoney(currency, row.totalPaid, { locale })}
                />
              )}
            <DetailRow
              label={t("dateTime")}
              value={`${formatSingleDateTime(row.created_at, undefined, locale).date} ${formatSingleDateTime(row.created_at, undefined, locale).time}`}
            />
            <DetailRow
              label={t("orderReference")}
              value={row.checkout_session_id ?? id}
            />
            {cancelledTickets.length > 0 && (
              <DetailRow
                label={t("cancelled")}
                value={`${cancelledTickets.length} of ${row.quantity}`}
              />
            )}
            {refundBadge && (
              <DetailRow
                label={t("refund")}
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
            <DetailRow label={t("plan")} value={row.subscription_plan_name} />
            <DetailRow
              label={t("unitPrice")}
              value={formatMoney(currency, row.unit_price, { locale })}
            />
            {row.discount > 0 && (
              <DetailRow
                label={t("discount")}
                value={`-${formatMoney(currency, row.discount, { locale })}`}
              />
            )}
            <DetailRow
              label={t("totalPrice")}
              value={formatMoney(currency, row.total_price, { locale })}
            />
            <DetailRow
              label={t("dateTime")}
              value={`${formatSingleDateTime(row.created_at, undefined, locale).date} ${formatSingleDateTime(row.created_at, undefined, locale).time}`}
            />
            <DetailRow label={t("reference")} value={id} />
          </>
        )}
      </div>
    </div>
  );
}
