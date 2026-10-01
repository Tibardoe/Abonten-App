import type {
  CreditActivityItem,
  CreditActivityState,
  CreditJournalType,
  CreditLotKind,
  CreditLotStatus,
} from "@abonten/types/rewards";
import type { CoreTranslator } from "../i18n/translator";

// Turns one row of get_my_credit_activity into the line a user sees. Pure and
// shared, so web and mobile show exactly the same wording and states. Grant
// lines (a reward, a bonus, an adjustment, credit returned by a refund) carry
// the CURRENT status of their lot, so one line moves from "pending" to
// "available" instead of a second line appearing. Words live under
// `creditActivity.*` of the core namespace; the server renders them in the
// requester's language.

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
  t: CoreTranslator,
  type: CreditJournalType,
  kind: CreditLotKind | null,
): string {
  if (type === "redeem.refund") return t("creditActivity.creditReturned");
  if (type === "adjust.credit") return t("creditActivity.creditAddedByAbonten");
  switch (kind) {
    case "reward":
      return t("creditActivity.reward");
    case "promotion":
      return t("creditActivity.promotionCredit");
    case "welcome":
      return t("creditActivity.welcomeCredit");
    default:
      return t("creditActivity.bonusCredit");
  }
}

function grantSubtitle(
  t: CoreTranslator,
  state: CreditActivityState,
  label: string | null,
): string | null {
  switch (state) {
    case "pending":
      return label
        ? t("creditActivity.fromPending", { label })
        : t("creditActivity.pending");
    case "reversed":
      return t("creditActivity.reversed");
    case "expired":
      return label
        ? t("creditActivity.labelExpired", { label })
        : t("creditActivity.expired");
    default:
      return label;
  }
}

const TARGET_KINDS = new Set(["event", "place", "ticket", "promotion"]);

export function toCreditActivityItem(
  t: CoreTranslator,
  row: CreditActivityRow,
  /** The person's credit currency (every row of one person shares it). */
  currency: string,
): CreditActivityItem {
  const type = row.journal_type as CreditJournalType;
  const lotStatus = (row.lot_status as CreditLotStatus | null) ?? null;
  const lotKind = (row.lot_kind as CreditLotKind | null) ?? null;

  let title: string;
  let subtitle: string | null;
  let state: CreditActivityState;

  if (GRANT_TYPES.has(type)) {
    state = grantState(lotStatus);
    title = grantTitle(t, type, lotKind);
    subtitle = grantSubtitle(t, state, row.label);
  } else {
    switch (type) {
      case "redeem.capture":
        title = row.label
          ? t("creditActivity.usedOn", { label: row.label })
          : t("creditActivity.usedAtCheckout");
        state = "used";
        break;
      case "expire":
        title = t("creditActivity.creditExpired");
        state = "expired";
        break;
      case "reward.clawback":
        title = t("creditActivity.rewardReversed");
        state = "reversed";
        break;
      case "adjust.debit":
        title = t("creditActivity.creditRemovedByAbonten");
        state = "completed";
        break;
      case "withdraw.request":
        title = t("creditActivity.withdrawal");
        state = "completed";
        break;
      default:
        title = t("creditActivity.creditUpdate");
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
    currency,
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
