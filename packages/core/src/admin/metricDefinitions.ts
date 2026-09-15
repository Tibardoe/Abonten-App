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
  | "health.dependency"
  // Rewards › Referrals
  | "referrals.linkVisits"
  | "referrals.attributedCheckouts"
  | "referrals.referredTicketSales"
  | "referrals.rewards"
  | "referrals.costShare"
  | "referrals.friendsJoined"
  | "referrals.friendsQualified"
  | "referrals.inviterRewards"
  | "referrals.welcomeCredit"
  // Rewards › Rebates
  | "rebates.organizer"
  | "rebates.venue"
  | "rebates.milestone"
  | "rebates.placeVisits"
  | "rebates.netRevenueBasis"
  // Rewards › Promoters & loyalty
  | "promoters.activeOffers"
  | "promoters.sales"
  | "promoters.commission"
  | "loyalty.feeRebates"
  // Discovery
  | "search.searches"
  | "search.zeroResultRate"
  | "search.clickThroughRate"
  | "search.latencyP50"
  | "search.latencyP95"
  | "search.suggestRequests"
  | "search.suggestOpenRate"
  | "search.suggestLatencyP95"
  | "recommendations.activeSubscriptions"
  | "recommendations.liveDigests"
  | "recommendations.shadowDigests"
  | "recommendations.openRate"
  | "recommendations.dismissRate"
  // Field Ops
  | "fieldOps.liveCampaigns"
  | "fieldOps.activeMembers"
  | "fieldOps.regions"
  | "fieldOps.territories"
  | "fieldOps.awaitingLead"
  | "fieldOps.awaitingAdmin"
  | "fieldOps.inHolding"
  | "fieldOps.readyToPay"
  | "fieldOps.inPayoutBatch"
  | "fieldOps.paid"
  | "fieldOps.coverage"
  | "fieldOps.succeeded"
  | "fieldOps.committed"
  | "fieldOps.costPerSuccess";

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

  // ── Rewards › Referrals ──────────────────────────────────────
  // Every reward figure is "what the engine decided", in Abonten Credit.
  // While shadow mode is on nothing was posted, so these are projections of
  // cost, not cost.
  {
    key: "referrals.linkVisits",
    label: "Link visits",
    short: "Times a shared event link with a referral code was opened.",
    definition:
      "How many times an event link carrying a referral code was opened in the period. The same person opening the same link twice counts twice; it measures reach, not people.",
    period: "range",
    unit: "count",
    source: "referral_touch.created_at in range",
  },
  {
    key: "referrals.attributedCheckouts",
    label: "Referred paid checkouts",
    short: "Paid ticket orders that arrived through a referral link.",
    definition:
      "Ticket checkouts that were paid in the period and carried a referrer, whether or not the reward engine ended up paying anything for them.",
    period: "range",
    unit: "count",
    source:
      "ticket_checkout where referrer_user_id is set, status = paid, completed_at in range",
  },
  {
    key: "referrals.referredTicketSales",
    label: "Referred ticket sales",
    short: "Ticket revenue on the sales the referral rule evaluated.",
    definition:
      "The ticket price (before the service fee, before any refund) of every sale the event-referral rule made a decision on in the period, including the ones it refused.",
    period: "range",
    unit: "money",
    source: "reward_event.basis.ticket_revenue_minor, event_referral rule",
    caveats: [
      "In shadow mode the sale is real but the reward beside it is a projection.",
    ],
  },
  {
    key: "referrals.rewards",
    label: "Referral rewards",
    short: "Credit the event-referral rule decided to pay.",
    definition:
      "Credit decided for people who referred a ticket sale in the period: pending, held for review and released, added together. Refused, voided, deferred and clawed-back decisions are listed separately and are not in this figure.",
    period: "range",
    unit: "money",
    source:
      "reward_event where rule_key = event_referral and status in (pending, held, released)",
    caveats: [
      "In shadow mode this is what would have been paid; no credit was posted.",
    ],
  },
  {
    key: "referrals.costShare",
    label: "Referral cost share",
    short: "Referral rewards as a share of the net revenue they sat on.",
    definition:
      "Referral rewards divided by the cash Abonten kept (service fee minus Paystack cost) on the same referred sales. The rule caps each reward at a share of its own sale's net revenue, so this only exceeds the cap if rewards were adjusted by hand.",
    period: "range",
    unit: "percent",
    source: "referral rewards ÷ net revenue on the referred sales",
  },
  {
    key: "referrals.friendsJoined",
    label: "Friends who joined",
    short: "New accounts bound to an inviter in the period.",
    definition:
      "People who created an account with a friend's invite code or link in the period. A person can be bound to one inviter only, and only while their account is new.",
    period: "range",
    unit: "count",
    source: "user_referral.bound_at in range",
  },
  {
    key: "referrals.friendsQualified",
    label: "Friends who qualified",
    short: "Invited friends who did the thing that earns a reward.",
    definition:
      "Invited friends whose action earned their inviter a decision in the period: a first ticket order, a ticket sold on their own event, or an approved place claim. Each friend counts once per path.",
    period: "range",
    unit: "count",
    source: "reward_event, friend_referral_referrer rule, by basis.path",
  },
  {
    key: "referrals.inviterRewards",
    label: "Inviter rewards",
    short: "Credit decided for people whose friends qualified.",
    definition:
      "Credit decided for inviters in the period: pending, held and released together. Refused and voided decisions are shown beside it.",
    period: "range",
    unit: "money",
    source:
      "reward_event where rule_key = friend_referral_referrer and status in (pending, held, released)",
  },
  {
    key: "referrals.welcomeCredit",
    label: "Welcome credit granted",
    short: "Credit released to invited friends after their first order.",
    definition:
      "Credit actually released to invited friends in the period, once their phone was verified and their first order went through. Friends refused for having bought before, or for sharing a device with the inviter, are counted beside it.",
    period: "range",
    unit: "money",
    source:
      "reward_event where rule_key = friend_referral_referee and status = released",
  },

  // ── Rewards › Rebates ────────────────────────────────────────
  {
    key: "rebates.organizer",
    label: "Organizer rebates",
    short: "Promotion credit decided for organizers by the monthly run.",
    definition:
      "Promotion-only credit the monthly run decided for organizers in the period: 20% of the cash Abonten kept on their settled events. Paid or pending; when shadow mode is on, the shadow total is shown beside it and nothing was posted.",
    period: "range",
    unit: "money",
    source:
      "reward_event where rule_key = organizer_rebate, by created_at, status not in (rejected, voided)",
  },
  {
    key: "rebates.venue",
    label: "Venue rebates",
    short: "Promotion credit decided for verified place owners.",
    definition:
      "Promotion-only credit decided for the owner of a verified place in the period: 5% of the cash Abonten kept on other organizers' events held there. Held for review when the owner and the organizer look like the same person.",
    period: "range",
    unit: "money",
    source: "reward_event where rule_key = venue_rebate, by created_at",
  },
  {
    key: "rebates.milestone",
    label: "Organizer milestones",
    short: "One-off bonuses for organizers who reached a milestone.",
    definition:
      "One-off promotion credit decided in the period for organizers who crossed a milestone in settled sales. Each organizer can earn it once.",
    period: "range",
    unit: "money",
    source: "reward_event where rule_key = organizer_milestone, by created_at",
  },
  {
    key: "rebates.placeVisits",
    label: "Place-visit rebates",
    short: "Promotion credit for the people who checked in at a place.",
    definition:
      "Promotion-only credit decided in the period for verified place owners, per different person who checked in with the place's QR code during the month. Decided once the month is over.",
    period: "range",
    unit: "money",
    source: "reward_event where rule_key = place_visits, by created_at",
  },
  {
    key: "rebates.netRevenueBasis",
    label: "Net revenue behind rebates",
    short: "The cash Abonten kept on the sales the rebates were priced from.",
    definition:
      "The service fee minus Paystack's cost on the settled sales that the counted rebates were calculated from, live and shadow together. Rebates are a share of this, so it says what the programme is giving back relative to what it kept.",
    period: "range",
    unit: "money",
    source: "reward_event.basis.net_revenue_minor, rebate rules",
  },

  // ── Rewards › Promoters & loyalty ────────────────────────────
  {
    key: "promoters.activeOffers",
    label: "Events offering a commission",
    short: "Events whose organizer is paying promoters right now.",
    definition:
      "Events with an active promoter commission set by their organizer at this moment. The organizer chooses the rate per event; a sale through a promoter's link on one of these events earns the promoter credit.",
    period: "point-in-time",
    unit: "count",
    source: "event_promoter_commission where is_active",
  },
  {
    key: "promoters.sales",
    label: "Promoter sales",
    short: "Ticket revenue on orders that came through promoters' links.",
    definition:
      "The ticket price of the orders that arrived through a promoter's link and were not refused, in the period. Live decisions only; shadow-mode projections are shown separately.",
    period: "range",
    unit: "money",
    source:
      "reward_event.basis.ticket_revenue_minor where rule_key = promoter_commission, live, status not in (rejected, voided)",
  },
  {
    key: "promoters.commission",
    label: "Promoter commission",
    short: "Credit decided for promoters, charged to organizers.",
    definition:
      "Credit decided for promoters in the period (pending, held and released together). The organizer is charged the same amount against their payout at once; what organizers were actually charged, net of reversals, is shown beside it and can differ when a sale is later refunded.",
    period: "range",
    unit: "money",
    source:
      "reward_event where rule_key = promoter_commission and status in (pending, held, released), live",
  },
  {
    key: "loyalty.feeRebates",
    label: "Loyalty fee rebates",
    short: "Service fee returned as credit on every fifth order.",
    definition:
      "Credit decided in the period for buyers whose fifth ticket order on a different event earned their cash service fee back (pending, held and released together). Refused decisions are counted beside it.",
    period: "range",
    unit: "money",
    source:
      "reward_event where rule_key = loyalty_fee_rebate and status in (pending, held, released), live",
  },

  // ── Discovery ────────────────────────────────────────────────
  // The search and recommendation figures come from two SQL functions that
  // take a number of days, so their window is a rolling one ending now
  // rather than whole calendar days. The pages say so.
  {
    key: "search.searches",
    label: "Searches",
    short: "First result pages served in the period.",
    definition:
      "How many searches returned a first page of results in the period. Type-ahead suggestions and scrolling to later pages are not counted. The log holds no user, device or IP identifiers.",
    period: "range",
    unit: "count",
    source: "search_query_log.created_at in the last N days",
    caveats: ["A rolling window ending now, not whole calendar days."],
  },
  {
    key: "search.zeroResultRate",
    label: "Zero-result rate",
    short: "Share of searches that found nothing.",
    definition:
      "Searches that returned no results, divided by all searches in the period. The list beside it shows what people looked for and could not find: missing listings, spellings, or wording organizers should use.",
    period: "range",
    unit: "percent",
    source: "search_query_log where zero_results ÷ all searches",
  },
  {
    key: "search.clickThroughRate",
    label: "Search click-through",
    short: "Share of searches where someone opened a result.",
    definition:
      "Searches after which the person opened one of the results, divided by all searches in the period. Opening nothing can mean the answer was already on the page, so read it with the zero-result rate.",
    period: "range",
    unit: "percent",
    source: "search_query_log where clicked_at is set ÷ all searches",
  },
  {
    key: "search.latencyP50",
    label: "Search time (median)",
    short: "Half of searches were faster than this.",
    definition:
      "The server-measured time to run a search, in milliseconds, at the median: half the searches in the period were faster. It excludes the network, so a person's wait is longer.",
    period: "range",
    unit: "ms",
    source: "search_query_log.duration_ms, 50th percentile",
  },
  {
    key: "search.latencyP95",
    label: "Search time (p95)",
    short: "Nineteen in twenty searches were faster than this.",
    definition:
      "The server-measured time to run a search, in milliseconds, at the 95th percentile: nineteen in twenty searches in the period were faster. Above 800 ms it turns amber.",
    period: "range",
    unit: "ms",
    source: "search_query_log.duration_ms, 95th percentile",
  },
  {
    key: "search.suggestRequests",
    label: "Type-ahead requests",
    short: "Suggestion lists served while people typed.",
    definition:
      "How many type-ahead suggestion lists the server returned in the period, on web and in the app. Each pause while typing can make one, so one search often makes several; read it as load and reach, not as a number of searches. Like searches, no user, device or IP identifiers are kept.",
    period: "range",
    unit: "count",
    source: "search_query_log where surface = suggest, last N days",
    caveats: [
      "App builds from before 2026-09-15 fetch suggestions directly from the database and are not counted.",
    ],
  },
  {
    key: "search.suggestOpenRate",
    label: "Suggestion opened",
    short: "Share of suggestion lists where someone opened a suggestion.",
    definition:
      "Suggestion lists after which the person opened one of the suggestions directly, divided by all suggestion lists in the period. Low because most lists are replaced by the next keystroke before anyone chooses.",
    period: "range",
    unit: "percent",
    source:
      "search_query_log where surface = suggest and clicked_at is set ÷ all suggestion rows",
  },
  {
    key: "search.suggestLatencyP95",
    label: "Type-ahead time (p95)",
    short: "Nineteen in twenty suggestion lists were faster than this.",
    definition:
      "The server-measured time to build a suggestion list, in milliseconds, at the 95th percentile. Type-ahead should feel instant, so above 300 ms it turns amber.",
    period: "range",
    unit: "ms",
    source:
      "search_query_log.latency_ms where surface = suggest, 95th percentile",
  },
  {
    key: "recommendations.activeSubscriptions",
    label: "Active alert subscriptions",
    short: "Opt-ins that are switched on right now.",
    definition:
      "Subscriptions people have turned on and not paused or turned off: an organizer's new events, a place's updates, or similar listings nearby. One person can hold several.",
    period: "point-in-time",
    unit: "count",
    source: "notification_subscription where status = active",
  },
  {
    key: "recommendations.liveDigests",
    label: "Live digests",
    short: "Recommendation digests created for real delivery.",
    definition:
      "Digests the builder created for real delivery in the period — at most one a day and three a week per person. Whether the push actually went out is under Push delivery.",
    period: "range",
    unit: "count",
    source: "recommendation_digest where not is_shadow, by digest_date",
  },
  {
    key: "recommendations.shadowDigests",
    label: "Shadow digests",
    short: "Digests that would have gone out in shadow mode.",
    definition:
      "Digests the builder recorded while shadow mode was on. Nobody received them; they show what the programme would send if it were live.",
    period: "range",
    unit: "count",
    source: "recommendation_digest where is_shadow, by digest_date",
  },
  {
    key: "recommendations.openRate",
    label: "Digest open rate",
    short: "Delivered digests that somebody opened.",
    definition:
      "Digests that were delivered and then opened, divided by digests delivered, in the period. Shown as not available until a push has actually been delivered.",
    period: "range",
    unit: "percent",
    source:
      "recommendation_digest where opened_at is set ÷ delivery_status = sent",
  },
  {
    key: "recommendations.dismissRate",
    label: "Picks marked not interested",
    short: "Share of picks people dismissed.",
    definition:
      "Picks a person marked as not interested, divided by all picks they could see in the period. Above a quarter the matching is too broad and the tile turns amber.",
    period: "range",
    unit: "percent",
    source: "recommendation where status = dismissed ÷ picks shown",
  },

  // ── Field Ops ────────────────────────────────────────────────
  {
    key: "fieldOps.liveCampaigns",
    label: "Live campaigns",
    short: "Campaigns that are running, paused or winding down.",
    definition:
      "Campaigns whose status is active, paused or winding down right now. Drafts and finished campaigns are not counted.",
    period: "point-in-time",
    unit: "count",
    source: "fieldops_campaign where status in (active, paused, winding_down)",
  },
  {
    key: "fieldOps.activeMembers",
    label: "Active field members",
    short: "People on live campaigns' teams right now.",
    definition:
      "Team members whose membership is active on a live campaign, added up across those campaigns. Invited and suspended members are not counted.",
    period: "point-in-time",
    unit: "count",
    source: "fieldops_campaign_member where status = active, live campaigns",
  },
  {
    key: "fieldOps.regions",
    label: "Active regions",
    short: "Regions set up for the programme.",
    definition:
      "Regions with the status active. A campaign runs in one region and covers its territories.",
    period: "point-in-time",
    unit: "count",
    source: "fieldops_region where status = active",
  },
  {
    key: "fieldOps.territories",
    label: "Territories mapped",
    short: "Towns and areas drawn on the map.",
    definition:
      "Territories (towns and areas, each a centre and radius or a polygon) that have not been retired, across all regions.",
    period: "point-in-time",
    unit: "count",
    source: "fieldops_territory where status <> retired",
  },
  {
    key: "fieldOps.awaitingLead",
    label: "Waiting on a team lead",
    short: "Onboardings sent in and not yet reviewed.",
    definition:
      "Onboardings a member has submitted that their team lead has not yet verified, returned or rejected. An admin can decide in the lead's place.",
    period: "point-in-time",
    unit: "count",
    source: "fieldops_onboarding where status = submitted",
  },
  {
    key: "fieldOps.awaitingAdmin",
    label: "Waiting on an admin",
    short: "Onboardings the sweep flagged for a person.",
    definition:
      "Verified onboardings the eligibility sweep would not pay on its own and has flagged for an admin to approve or reject, each with the reason.",
    period: "point-in-time",
    unit: "count",
    source: "fieldops_onboarding where status = flagged",
  },
  {
    key: "fieldOps.inHolding",
    label: "Commissions in holding",
    short: "Verified, inside the holding period.",
    definition:
      "Commissions earned on verified onboardings whose holding period is still running, so the sweep has not yet confirmed them. Nothing here can be paid yet.",
    period: "point-in-time",
    unit: "money",
    source: "fieldops_commission where status = pending, summed per currency",
  },
  {
    key: "fieldOps.readyToPay",
    label: "Commissions ready to pay",
    short: "Confirmed by the sweep, not yet in a batch.",
    definition:
      "Commissions the sweep has confirmed and that are waiting for someone to build a payout batch. The next batch is previewed under Payouts.",
    period: "point-in-time",
    unit: "money",
    source: "fieldops_commission where status = approved, summed per currency",
  },
  {
    key: "fieldOps.inPayoutBatch",
    label: "Commissions in a payout batch",
    short: "Built into a batch that has not been paid yet.",
    definition:
      "Commissions placed in a payout batch that is approved or still being paid. They leave this figure when each item is marked paid or failed.",
    period: "point-in-time",
    unit: "money",
    source: "fieldops_commission where status = in_payout, summed per currency",
  },
  {
    key: "fieldOps.paid",
    label: "Commissions paid",
    short: "Paid to members, net of reversals.",
    definition:
      "Everything the programme has ever paid its members, less the offsets written when a paid commission was reversed. A reversal never edits the original row; it adds a negative one.",
    period: "all-time",
    unit: "money",
    source:
      "fieldops_commission where status = paid, summed per currency (reversal offsets are negative rows)",
  },
  {
    key: "fieldOps.coverage",
    label: "Territory coverage",
    short: "Share of the campaign's towns someone has worked.",
    definition:
      "Territories in the campaign's region that have been covered or completed, divided by all of them. A town counts as covered once a member has been assigned there and started.",
    period: "point-in-time",
    unit: "percent",
    source: "fieldops_campaign_stats().territories",
  },
  {
    key: "fieldOps.succeeded",
    label: "Successful onboardings",
    short: "Onboardings that passed every check.",
    definition:
      "Onboardings whose every eligibility check passed, so the commission was approved: the business is listed, its owner verified, and (if the rule asks) it did what the rule required. The same word is used on every Field Ops page for this state.",
    period: "all-time",
    unit: "count",
    source: "fieldops_onboarding where status = succeeded",
  },
  {
    key: "fieldOps.committed",
    label: "Commissions committed",
    short: "Approved, in a batch, or paid — money the programme owes or spent.",
    definition:
      "Commissions the campaign is committed to: ready to pay, in a payout batch, and already paid, added together. Commissions still in holding are not committed yet and are not in this figure.",
    period: "all-time",
    unit: "money",
    source: "fieldops_campaign_stats().money: approved + in_payout + paid",
  },
  {
    key: "fieldOps.costPerSuccess",
    label: "Cost per successful onboarding",
    short: "Committed commissions divided by successes.",
    definition:
      "Everything committed (ready to pay, in a batch and paid) divided by the number of successful onboardings. Not shown, rather than shown as zero, while nothing has succeeded.",
    period: "all-time",
    unit: "money",
    source: "fieldops_campaign_stats().costPerSuccessMinor",
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
