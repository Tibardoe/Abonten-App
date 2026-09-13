// What every number in the admin console means, in one place.
//
// A figure an operator cannot define is a figure they cannot act on, and the
// same word had meant different things on different pages ("gross" three
// ways, "organizers" three ways). Each entry below is the single wording the
// UI shows, the plain-language definition behind its ⓘ, the period it covers
// and the rows it is read from. `docs/admin/metrics.md` is generated from
// this file, so the console and the handbook cannot drift apart.

export type MetricPeriod =
  /** Filtered to the selected window. */
  | "range"
  /** Everything ever recorded. */
  | "all-time"
  /** The state right now, whatever window is selected. */
  | "point-in-time";

export type MetricUnit = "count" | "money" | "percent" | "ratio" | "ms";

export type MetricKey =
  // people
  | "users.active"
  | "users.allAccounts"
  | "users.new"
  | "organizers.total"
  | "organizers.withNewEvents"
  | "placeOwners.total"
  // catalogue
  | "events.published"
  | "events.all"
  | "events.new"
  | "places.total"
  | "places.new"
  // tickets
  | "tickets.paid"
  | "tickets.free"
  | "tickets.issuedAllTime"
  // money in
  | "money.grossTicketSales"
  | "money.totalCharged"
  | "money.serviceFeeRevenue"
  | "money.processingCost"
  | "money.netPlatformRevenue"
  // refunds
  | "refunds.pendingCount"
  | "refunds.pendingAmount"
  | "refunds.issuedCount"
  | "refunds.cashRefunded"
  // organizer money
  | "organizerMoney.booked"
  | "organizerMoney.deducted"
  | "organizerMoney.paidOut"
  | "organizerMoney.stillOwed"
  | "organizerMoney.payoutsInFlight"
  // demographics (Analytics)
  | "demo.signInMethod"
  | "demo.platform"
  | "demo.accountStatus"
  | "demo.roles"
  | "demo.buyers"
  | "demo.repeatBuyers"
  | "demo.buyerConversion"
  | "demo.returningBuyers"
  // operations
  | "attention.stuckPayments"
  | "attention.failingHealthChecks"
  | "health.dependency";

export type MetricDefinition = {
  key: MetricKey;
  /** The label the console shows. One name per metric, everywhere. */
  label: string;
  /** One sentence, for a card subtitle or a list. */
  short: string;
  /** The precise meaning, in plain language, for the ⓘ. */
  definition: string;
  period: MetricPeriod;
  unit: MetricUnit;
  /** Where the figure is read from — table, column, filter. */
  source: string;
  /** Anything that could mislead an operator who trusted the label. */
  caveats?: string[];
};

const DEFINITIONS: MetricDefinition[] = [
  {
    key: "users.active",
    label: "Active users",
    short: "People who can use Abonten today.",
    definition:
      "Accounts whose status is Active. Suspended, banned and deleted accounts are excluded, so this is who can sign in and buy right now — not how many accounts were ever created.",
    period: "point-in-time",
    unit: "count",
    source: "user_info where status_id = 1",
  },
  {
    key: "users.allAccounts",
    label: "All accounts",
    short: "Every account ever created, whatever its state.",
    definition:
      "Every user_info row, including suspended, banned and deleted accounts. A deleted account keeps its row so the tickets and payments attached to it survive.",
    period: "point-in-time",
    unit: "count",
    source: "user_info, all statuses",
  },
  {
    key: "users.new",
    label: "New users",
    short: "Accounts created in the selected period.",
    definition:
      "Accounts created inside the window, counted on the day they signed up, whatever happened to the account afterwards.",
    period: "range",
    unit: "count",
    source: "user_info.created_at in range",
    caveats: [
      "An account created in the window and later suspended or deleted is still counted here.",
    ],
  },
  {
    key: "organizers.total",
    label: "Organizers",
    short: "People with at least one event the public can see.",
    definition:
      "Distinct people who have published or cancelled at least one event. Someone with only a draft is not an organizer yet. Place owners are counted under Places, not here.",
    period: "point-in-time",
    unit: "count",
    source: "distinct event.organizer_id where status is not draft",
  },
  {
    key: "organizers.withNewEvents",
    label: "Organizers who added an event",
    short: "Organizers who created an event during the period.",
    definition:
      "Distinct organizers of events created inside the window. It says who was busy adding listings — not who sold anything.",
    period: "range",
    unit: "count",
    source: "distinct event.organizer_id where event.created_at in range",
  },
  {
    key: "placeOwners.total",
    label: "Place owners",
    short: "People who own at least one place listing.",
    definition:
      "Distinct owners of a place listing, whether or not they also organize events.",
    period: "point-in-time",
    unit: "count",
    source: "distinct place.owner_id",
  },
  {
    key: "events.published",
    label: "Events",
    short: "Events the public can see.",
    definition:
      "Events with status published. Drafts, cancelled and completed events are not counted; the all-statuses total is shown beside it.",
    period: "point-in-time",
    unit: "count",
    source: "event where status = 'published'",
  },
  {
    key: "events.all",
    label: "All events",
    short: "Every event row, drafts included.",
    definition:
      "Every event ever created, in any status — draft, published, cancelled or completed.",
    period: "point-in-time",
    unit: "count",
    source: "event, all statuses",
  },
  {
    key: "events.new",
    label: "New events",
    short: "Events created in the selected period.",
    definition:
      "Events created inside the window, counted on the day they were created rather than the day they start.",
    period: "range",
    unit: "count",
    source: "event.created_at in range",
  },
  {
    key: "places.total",
    label: "Places",
    short: "Place listings on Abonten.",
    definition: "Every place listing, claimed or not, verified or not.",
    period: "point-in-time",
    unit: "count",
    source: "place",
  },
  {
    key: "places.new",
    label: "New places",
    short: "Place listings created in the period.",
    definition: "Place listings created inside the window.",
    period: "range",
    unit: "count",
    source: "place.created_at in range",
  },
  {
    key: "tickets.paid",
    label: "Tickets sold",
    short: "Paid tickets issued in the period that still stand.",
    definition:
      "Tickets with a payment behind them, issued inside the window, minus the ones later cancelled. Free registrations are counted separately so a free event cannot inflate sales.",
    period: "range",
    unit: "count",
    source:
      "ticket.issued_at in range, transaction_id is not null, status <> 'cancelled'",
    caveats: [
      "A ticket cancelled after the window still disappears from this figure, because the count is taken now.",
    ],
  },
  {
    key: "tickets.free",
    label: "Free registrations",
    short: "Free places taken in the period.",
    definition:
      "Tickets issued without a payment — registrations for free events — inside the window, minus the ones later cancelled.",
    period: "range",
    unit: "count",
    source:
      "ticket.issued_at in range, transaction_id is null, status <> 'cancelled'",
  },
  {
    key: "tickets.issuedAllTime",
    label: "Tickets issued",
    short: "Every ticket that still stands, paid or free.",
    definition:
      "All tickets ever issued, paid and free together, excluding cancelled ones.",
    period: "all-time",
    unit: "count",
    source: "ticket where status <> 'cancelled'",
  },
  {
    key: "money.grossTicketSales",
    label: "Gross ticket sales",
    short: "What buyers paid for tickets, before refunds.",
    definition:
      "The ticket price customers paid on sales recorded in the window, before any refund is taken off. It excludes the Abonten service fee, which is reported separately, and covers ticket sales only — promotions and subscriptions are not included.",
    period: "range",
    unit: "money",
    source: "platform_fee_entry.ticket_revenue where entry_type = 'fee'",
    caveats: [
      "Refunds are not netted off here; see cash refunded.",
      "Money paid with Abonten Credit is included, because the organizer is owed it either way.",
    ],
  },
  {
    key: "money.totalCharged",
    label: "Total charged",
    short: "Everything customers paid, ticket price plus service fee.",
    definition:
      "The full amount charged to customers on sales recorded in the window: ticket price plus the Abonten service fee. Before refunds.",
    period: "range",
    unit: "money",
    source:
      "platform_fee_entry.total_customer_payment where entry_type = 'fee'",
  },
  {
    key: "money.serviceFeeRevenue",
    label: "Service fee revenue",
    short: "Abonten's fee on the period's sales.",
    definition:
      "The Abonten service fee customers paid on top of the ticket price. It is kept when a ticket is refunded, so it is not reduced by refunds.",
    period: "range",
    unit: "money",
    source: "platform_fee_entry.service_fee where entry_type = 'fee'",
  },
  {
    key: "money.processingCost",
    label: "Payment processing cost",
    short: "What Paystack charged Abonten on those sales.",
    definition:
      "The processing fee Paystack reported when the payment was verified. Payments where Paystack reported no fee are left out rather than counted as free.",
    period: "range",
    unit: "money",
    source:
      "platform_fee_entry.processing_cost where entry_type = 'fee' and the cost is known",
  },
  {
    key: "money.netPlatformRevenue",
    label: "Net platform revenue",
    short: "Service fee minus payment processing cost.",
    definition:
      "What Abonten kept on the period's sales: the service fee less Paystack's processing cost. Only payments whose processing cost was reported are included, so the card also says how many of the period's payments that covers.",
    period: "range",
    unit: "money",
    source: "platform_fee_entry.net_revenue where entry_type = 'fee'",
    caveats: [
      "An order paid entirely with Abonten Credit never reaches Paystack, so it has no reported cost and is excluded.",
      "This is not profit: it takes no account of Abonten's own running costs.",
    ],
  },
  {
    key: "refunds.pendingCount",
    label: "Awaiting a refund",
    short: "Refund requests not yet sent back.",
    definition:
      "Transactions whose refund has been requested but not completed, counted right now regardless of the selected period, because every open request needs action whenever the sale happened.",
    period: "point-in-time",
    unit: "count",
    source: "transaction where status = 'refund_pending'",
  },
  {
    key: "refunds.pendingAmount",
    label: "Still refundable",
    short: "Money those open requests can still send back.",
    definition:
      "The ticket revenue recorded against each open refund request. The Abonten service fee is retained on a refund, so it is not part of this figure.",
    period: "point-in-time",
    unit: "money",
    source: "platform_fee_entry.ticket_revenue of the pending transactions",
  },
  {
    key: "refunds.issuedCount",
    label: "Refunds issued",
    short: "Refunds completed in the period.",
    definition:
      "Refunds actually sent back during the window, counted from the refund entry written when the money left.",
    period: "range",
    unit: "count",
    source:
      "platform_fee_entry rows where entry_type = 'fee_refund_adjustment'",
  },
  {
    key: "refunds.cashRefunded",
    label: "Cash refunded",
    short: "Money sent back to customers in the period.",
    definition:
      "The cash actually returned — ticket price only, since Abonten keeps the service fee on a refund. A refund that has only been requested is not counted here.",
    period: "range",
    unit: "money",
    source:
      "−Σ platform_fee_entry.ticket_revenue where entry_type = 'fee_refund_adjustment'",
  },
  {
    key: "organizerMoney.booked",
    label: "Earnings booked",
    short: "What organizers earned from ticket sales, before refunds.",
    definition:
      "Everything credited to organizers for tickets sold, plus any promoter commission charged against those sales. Organizers receive 100% of the ticket price they set; the service fee is the customer's, on top.",
    period: "all-time",
    unit: "money",
    source:
      "organizer_ledger_entry earning + promoter commission entries, all time",
  },
  {
    key: "organizerMoney.deducted",
    label: "Refunds deducted",
    short: "Refunds taken off organizers.",
    definition:
      "Money removed from organizers because a refund was requested. The deduction happens as soon as the refund is asked for and is put back only if the refund fails, so a completed refund stays deducted here.",
    period: "all-time",
    unit: "money",
    source: "organizer_ledger_entry refund_hold / refund_release, all time",
  },
  {
    key: "organizerMoney.paidOut",
    label: "Paid out",
    short: "Money already sent to organizers or reserved for a payout.",
    definition:
      "Everything paid out, plus anything reserved for a payout that is still processing. A failed or cancelled payout releases its reservation and comes back out of this figure.",
    period: "all-time",
    unit: "money",
    source: "organizer_ledger_entry payout_hold / payout_release, all time",
  },
  {
    key: "organizerMoney.stillOwed",
    label: "Still owed",
    short: "Earnings booked, less refunds and what has been paid out.",
    definition:
      "What organizers are owed in total. Not all of it can be paid today: earnings become available 48 hours after the event ends. A negative figure means refunds were confirmed after money had already gone out, and it is shown rather than hidden at zero.",
    period: "all-time",
    unit: "money",
    source: "earnings booked − refunds deducted − paid out",
    caveats: [
      "Payable today is smaller than this: open an organizer to see available against pending settlement.",
    ],
  },
  {
    key: "organizerMoney.payoutsInFlight",
    label: "Payouts in flight",
    short: "Payouts being processed right now.",
    definition:
      "Payouts with status processing — requested and reserved, not yet settled as paid or failed.",
    period: "point-in-time",
    unit: "count",
    source: "payout where status = 'processing'",
  },
  {
    key: "demo.signInMethod",
    label: "How people sign in",
    short: "Share of accounts by sign-in method.",
    definition:
      "The provider each account signs in with — Google, phone or email. Read from the authentication records, counted in aggregate only.",
    period: "point-in-time",
    unit: "count",
    source: "auth.users provider, joined to non-deleted accounts",
    caveats: [
      "Someone can link more than one method; each account is counted once, under the one it was created with.",
    ],
  },
  {
    key: "demo.platform",
    label: "Mobile platforms",
    short: "Android against iOS, among people who allowed push.",
    definition:
      "The platform of the devices registered for push notifications. It covers only people who installed the app and allowed notifications, so it is not a census of all users, and web-only users do not appear at all.",
    period: "point-in-time",
    unit: "count",
    source: "distinct device_token.user_id by platform",
    caveats: [
      "Not a share of all users: people who never allowed push are absent.",
    ],
  },
  {
    key: "demo.accountStatus",
    label: "Account status",
    short: "Active, suspended, banned and deleted accounts.",
    definition: "Every account grouped by the status it holds now.",
    period: "point-in-time",
    unit: "count",
    source: "user_info.status_id",
  },
  {
    key: "demo.roles",
    label: "What people do here",
    short: "Organizers, place owners, buyers and everyone else.",
    definition:
      "Active accounts split by what they have actually done, each person counted once in their widest role: organizer, then place owner, then buyer, then no activity yet.",
    period: "point-in-time",
    unit: "count",
    source: "event.organizer_id, place.owner_id, transaction.user_id",
  },
  {
    key: "demo.buyers",
    label: "Buyers",
    short: "People who have paid for at least one order.",
    definition:
      "Distinct people with at least one captured payment, refunded ones included — they still bought.",
    period: "all-time",
    unit: "count",
    source: "distinct transaction.user_id where the payment was captured",
  },
  {
    key: "demo.repeatBuyers",
    label: "Repeat buyers",
    short: "People who have bought more than once.",
    definition:
      "People with at least two captured payments. It is the simplest honest signal that Abonten is worth coming back to.",
    period: "all-time",
    unit: "count",
    source: "transaction.user_id having at least two captured payments",
  },
  {
    key: "demo.buyerConversion",
    label: "Buyers among users",
    short: "Share of active accounts that have ever bought.",
    definition:
      "Buyers divided by active accounts. It is a lifetime figure, not a funnel: someone who signed up yesterday counts in the denominator immediately.",
    period: "all-time",
    unit: "percent",
    source: "buyers ÷ active accounts",
  },
  {
    key: "demo.returningBuyers",
    label: "Returning buyers",
    short: "Share of the previous period's buyers who bought again.",
    definition:
      "People who bought in the previous period and bought again in this one, as a share of the previous period's buyers. Shown only when the previous period had enough buyers to be meaningful.",
    period: "range",
    unit: "percent",
    source: "buyers in both windows ÷ buyers in the previous window",
  },
  {
    key: "attention.stuckPayments",
    label: "Stuck payments",
    short: "Payment attempts still unfinished after 30 minutes.",
    definition:
      "Payment attempts that have been started, pending or processing for more than 30 minutes. A healthy payment finishes in seconds, so anything here is worth opening.",
    period: "point-in-time",
    unit: "count",
    source:
      "payment_attempt where status is initiated/pending/processing and older than 30 minutes",
  },
  {
    key: "attention.failingHealthChecks",
    label: "Failing health checks",
    short: "Dependencies that failed their last probe.",
    definition:
      "How many of the monitored dependencies reported a failure on their most recent probe. Probes run every two minutes.",
    period: "point-in-time",
    unit: "count",
    source: "latest health_check_result per check key where ok is false",
  },
  {
    key: "health.dependency",
    label: "Dependency health",
    short: "The most recent probe result for each dependency.",
    definition:
      "The latest result for each service Abonten depends on — the database, authentication, storage, Paystack, email, SMS, media and push — with how long the probe took.",
    period: "point-in-time",
    unit: "count",
    source: "health_check_result, newest row per check key",
    caveats: [
      "A probe that stopped running keeps showing its last result; check the time beside it.",
    ],
  },
];

export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> =
  Object.fromEntries(DEFINITIONS.map((d) => [d.key, d])) as Record<
    MetricKey,
    MetricDefinition
  >;

export function metricDefinition(key: MetricKey): MetricDefinition {
  const found = METRIC_DEFINITIONS[key];
  if (!found) throw new Error(`Unknown metric key: ${key}`);
  return found;
}

export function metricKeys(): MetricKey[] {
  return DEFINITIONS.map((d) => d.key);
}

/** The period wording a card shows under its value. */
export function metricPeriodLabel(
  definition: MetricDefinition,
  rangeLabel: string,
): string {
  switch (definition.period) {
    case "range":
      return rangeLabel;
    case "all-time":
      return "All time";
    case "point-in-time":
      return "Right now";
  }
}
