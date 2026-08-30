import getOrganizerPayoutDetail from "@/actions/getOrganizerPayoutDetail";
import FinanceLineIcon, {
  getFinanceStatusMeta,
} from "@/finances/atoms/FinanceLineIcon";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { maskAccountNumber } from "@abonten/core/maskAccountNumber";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between items-center">
      <p>{label}</p>
      <p>{value}</p>
    </div>
  );
}

export default async function PayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await getOrganizerPayoutDetail(id);

  if (result.status === 404) {
    notFound();
  }

  if (result.status !== 200) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load this payout. Please try again.
      </p>
    );
  }

  const payout = result.data;
  const { label: statusLabel } = getFinanceStatusMeta(payout.status);
  const destinationLabel =
    payout.payout_account?.account_type === "mobile_money"
      ? payout.payout_account.provider
      : "Bank Account";

  return (
    <div className="space-y-10 text-sm mb-5 md:mb-0 w-full">
      <div className="font-bold text-muted-foreground flex justify-between items-center bg-muted rounded-md p-5">
        <p>Amount</p>
        <p>
          {payout.currency} {payout.amount.toLocaleString()}
        </p>
      </div>

      <div className="flex gap-3 bg-muted rounded-md p-5 items-center">
        <FinanceLineIcon
          status={payout.status}
          className="text-2xl md:text-3xl"
        />
        <div>
          <p className="font-bold">{statusLabel}</p>
          <p className="text-muted-foreground text-xs">
            Requested: {formatSingleDateTime(payout.requested_at).date}{" "}
            {formatSingleDateTime(payout.requested_at).time}
          </p>
        </div>
      </div>

      <div className="font-semibold text-muted-foreground bg-muted rounded-md p-5 space-y-5">
        <DetailRow label="Reference" value={payout.reference} />
        <DetailRow label="Destination" value={destinationLabel} />
        {payout.payout_account && (
          <DetailRow
            label="Account"
            value={maskAccountNumber(payout.payout_account.account_number)}
          />
        )}
        <DetailRow
          label="Account holder"
          value={payout.payout_account?.account_holder_name}
        />
        <DetailRow
          label="Requested"
          value={`${formatSingleDateTime(payout.requested_at).date} ${formatSingleDateTime(payout.requested_at).time}`}
        />
        {payout.processed_at && (
          <DetailRow
            label="Processed"
            value={`${formatSingleDateTime(payout.processed_at).date} ${formatSingleDateTime(payout.processed_at).time}`}
          />
        )}
        {payout.failure_reason && (
          <DetailRow
            label="Failure reason"
            value={
              <span className="text-destructive">{payout.failure_reason}</span>
            }
          />
        )}
      </div>
    </div>
  );
}
