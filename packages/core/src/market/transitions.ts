// The market state machine. Mirrors `market_transition()` in the database,
// which is the authority; this copy lets the admin UI show the right
// buttons and the tests describe the rules.

import type { MarketStatus } from "./types";

export type MarketTransition =
  | "prepare"
  | "mark_ready"
  | "activate"
  | "pause"
  | "resume"
  | "enter_maintenance"
  | "exit_maintenance"
  | "back_to_draft";

export const MARKET_TRANSITIONS: Readonly<
  Record<
    MarketTransition,
    {
      from: readonly MarketStatus[];
      to: MarketStatus;
      label: string;
      stepUp: boolean;
      needsReadiness: boolean;
    }
  >
> = {
  prepare: {
    from: ["draft", "ready"],
    to: "preparing",
    label: "Start preparing",
    stepUp: false,
    needsReadiness: false,
  },
  mark_ready: {
    from: ["preparing"],
    to: "ready",
    label: "Mark ready",
    stepUp: false,
    needsReadiness: true,
  },
  activate: {
    from: ["ready", "paused"],
    to: "live",
    label: "Activate market",
    stepUp: true,
    needsReadiness: true,
  },
  pause: {
    from: ["live", "maintenance"],
    to: "paused",
    label: "Pause market",
    stepUp: true,
    needsReadiness: false,
  },
  resume: {
    from: ["paused"],
    to: "live",
    label: "Resume market",
    stepUp: true,
    needsReadiness: true,
  },
  enter_maintenance: {
    from: ["live"],
    to: "maintenance",
    label: "Enter maintenance",
    stepUp: true,
    needsReadiness: false,
  },
  exit_maintenance: {
    from: ["maintenance"],
    to: "live",
    label: "Exit maintenance",
    stepUp: true,
    needsReadiness: false,
  },
  back_to_draft: {
    from: ["preparing", "ready", "paused"],
    to: "draft",
    label: "Back to draft",
    stepUp: false,
    needsReadiness: false,
  },
};

export function availableTransitions(status: MarketStatus): MarketTransition[] {
  return (Object.keys(MARKET_TRANSITIONS) as MarketTransition[]).filter((t) =>
    MARKET_TRANSITIONS[t].from.includes(status),
  );
}

export function canTransition(
  status: MarketStatus,
  transition: MarketTransition,
): boolean {
  return MARKET_TRANSITIONS[transition].from.includes(status);
}
