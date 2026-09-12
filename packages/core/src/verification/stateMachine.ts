// The Trust & Verification state machine, framework-free.
//
// This MUST mirror the `v_to := case ...` block in
// public.verification_transition() (migration 20260912120000). The database
// is the enforcement authority — every transition goes through that RPC.
// This copy exists so the web, mobile and admin UIs can show exactly the
// actions that will actually be accepted, instead of firing a request and
// rendering an error.

import type {
  VerificationAction,
  VerificationActorKind,
  VerificationStatus,
} from "@abonten/types/verificationType";

export type {
  VerificationAction,
  VerificationActorKind,
  VerificationStatus,
};

type Rule = {
  action: VerificationAction;
  from: VerificationStatus[];
  to: VerificationStatus;
  actors: VerificationActorKind[];
};

// draft ──submit──▶ pending_review ──approve──▶ approved ──revoke──▶ revoked
//   │                  │  ▲                       (admin / system)
//   │                  │  └──resubmit── needs_info ◀──request_info──┘
//   │                  ├──reject──▶ rejected        needs_info ──reject──▶ rejected
//   └──withdraw──▶ withdrawn ◀──withdraw── pending_review | needs_info
const RULES: Rule[] = [
  { action: "submit", from: ["draft"], to: "pending_review", actors: ["user"] },
  {
    action: "resubmit",
    from: ["needs_info"],
    to: "pending_review",
    actors: ["user"],
  },
  {
    // `system` withdraws open cases when the place changes hands, and when a
    // draft goes stale (the retention job).
    action: "withdraw",
    from: ["draft", "pending_review", "needs_info"],
    to: "withdrawn",
    actors: ["user", "system"],
  },
  {
    action: "approve",
    from: ["pending_review"],
    to: "approved",
    actors: ["admin"],
  },
  {
    action: "reject",
    from: ["pending_review", "needs_info"],
    to: "rejected",
    actors: ["admin"],
  },
  {
    action: "request_info",
    from: ["pending_review"],
    to: "needs_info",
    actors: ["admin"],
  },
  {
    // `system` revokes on owner change and on an organizer ban.
    action: "revoke",
    from: ["approved"],
    to: "revoked",
    actors: ["admin", "system"],
  },
];

/** Actions whose reason is shown to the requester, so one is required. */
export const REASON_REQUIRED_ACTIONS: VerificationAction[] = [
  "reject",
  "request_info",
  "revoke",
];

/** Statuses in which the requester may still edit the case and its evidence. */
export const EDITABLE_STATUSES: VerificationStatus[] = ["draft", "needs_info"];

/** Statuses that count as "a request is in flight" for the owner's UI. */
export const OPEN_STATUSES: VerificationStatus[] = [
  "draft",
  "pending_review",
  "needs_info",
];

export function canTransition(
  from: VerificationStatus,
  action: VerificationAction,
  actorKind: VerificationActorKind,
): boolean {
  return RULES.some(
    (r) =>
      r.action === action &&
      r.from.includes(from) &&
      r.actors.includes(actorKind),
  );
}

export function nextStatus(
  from: VerificationStatus,
  action: VerificationAction,
  actorKind: VerificationActorKind,
): VerificationStatus | null {
  const rule = RULES.find(
    (r) =>
      r.action === action &&
      r.from.includes(from) &&
      r.actors.includes(actorKind),
  );
  return rule ? rule.to : null;
}

export function actionsFor(
  from: VerificationStatus,
  actorKind: VerificationActorKind,
): VerificationAction[] {
  return RULES.filter(
    (r) => r.from.includes(from) && r.actors.includes(actorKind),
  ).map((r) => r.action);
}

export function reasonRequired(action: VerificationAction): boolean {
  return REASON_REQUIRED_ACTIONS.includes(action);
}

export function isEditable(status: VerificationStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function isOpen(status: VerificationStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * Whether the owner may start a fresh request. There is no case at all
 * (`null`), or the last one ended without a live approval. An approved case
 * blocks a new one — the partial unique index enforces the same thing.
 */
export function canStartNewCase(
  status: VerificationStatus | null | undefined,
): boolean {
  if (!status) return true;
  return status === "rejected" || status === "withdrawn" || status === "revoked";
}
