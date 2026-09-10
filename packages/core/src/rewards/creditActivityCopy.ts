import type {
  CreditActivityItem,
  CreditActivityState,
  CreditJournalType,
  CreditLotKind,
  CreditLotStatus,
} from "@abonten/types/rewards";

// Turns one row of get_my_credit_activity into the line a user sees. Pure and
// shared, so web and mobile show exactly the same wording and states. Grant
// lines (a reward, a bonus, an adjustment, credit returned by a refund) carry
// the CURRENT status of their lot, so one line moves from "pending" to
// "available" instead of a second line appearing.

export type CreditActivityRow = {
  id: string;
  journal_type: string;
  amount_minor: number;
  label: string | null;
  source_type: string | null;
  source_id: string | null;
  lot_kind: string | null;
  lot_status: string | null;
  lot_expires_at: string | null;
  lot_release_at: string | null;
  created_at: string;
};

const GRANT_TYPES = new Set<CreditJournalType>([
  "reward.accrue",
  "bonus.grant",
  "adjust.credit",
  "redeem.refund",
]);

function grantState(status: CreditLotStatus | null): CreditActivityState {
  switch (status) {
    case "pending":
      return "pending";
    case "voided":
    case "clawed_back":
    case "forfeited":
      return "reversed";
    case "expired":
      return "expired";
    case "exhausted":
      // Fully spent: the grant itself is simply done.
      return "completed";
    default:
      return "available";
  }
}

function grantTitle(
  type: CreditJournalType,
  kind: CreditLotKind | null,
): string {
  if (type === "redeem.refund") return "Credit returned";
  if (type === "adjust.credit") return "Credit added by Abonten";
  switch (kind) {
    case "reward":
      return "Reward";
    case "promotion":
      return "Promotion credit";
    case "welcome":
      return "Welcome credit";
    default:
      return "Bonus credit";
  }
}

function grantSubtitle(
  state: CreditActivityState,
  label: string | null,
): string | null {
  switch (state) {
    case "pending":
      return label ? `From ${label} · pending` : "Pending";
    case "reversed":
      return "Removed because the order was refunded or cancelled";
    case "expired":
      return label ? `${label} · expired` : "Expired";
    default:
      return label;
  }
}

const TARGET_KINDS = new Set(["event", "place", "ticket", "promotion"]);

export function toCreditActivityItem(
  row: CreditActivityRow,
): CreditActivityItem {
  const type = row.journal_type as CreditJournalType;
  const lotStatus = (row.lot_status as CreditLotStatus | null) ?? null;
  const lotKind = (row.lot_kind as CreditLotKind | null) ?? null;

  let title: string;
  let subtitle: string | null;
  let state: CreditActivityState;

  if (GRANT_TYPES.has(type)) {
    state = grantState(lotStatus);
    title = grantTitle(type, lotKind);
    subtitle = grantSubtitle(state, row.label);
  } else {
    switch (type) {
      case "redeem.capture":
        title = row.label ? `Used on ${row.label}` : "Used at checkout";
        state = "used";
        break;
      case "expire":
        title = "Credit expired";
        state = "expired";
        break;
      case "reward.clawback":
        title = "Reward reversed";
        state = "reversed";
        break;
      case "adjust.debit":
        title = "Credit removed by Abonten";
        state = "completed";
        break;
      case "withdraw.request":
        title = "Withdrawal";
        state = "completed";
        break;
      default:
        title = "Credit update";
        state = "completed";
    }
    subtitle =
      type === "redeem.capture" || type === "expire" ? null : row.label;
  }

  const target =
    row.source_type && row.source_id && TARGET_KINDS.has(row.source_type)
      ? {
          kind: row.source_type as "event" | "place" | "ticket" | "promotion",
          id: row.source_id,
        }
      : null;

  return {
    id: row.id,
    createdAt: row.created_at,
    journalType: type,
    amountMinor: Number(row.amount_minor),
    title,
    subtitle,
    state,
    releaseAt: state === "pending" ? row.lot_release_at : null,
    expiresAt: state === "available" ? row.lot_expires_at : null,
    target,
  };
}
