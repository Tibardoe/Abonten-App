import type { LoyaltyProgress, RewardsProgram } from "@abonten/types/rewards";
import { formatCredit } from "./creditAmount";

// The "How to earn" wording for the Rewards pages, built only from the LIVE
// program terms so a page can never promise something the reward engine
// doesn't pay. Shared by web and mobile so the two say the same thing.

const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

export function rewardsEarnLines(program: RewardsProgram): string[] {
  const lines: string[] = [];
  if (program.eventReferral) {
    lines.push(
      `Share an event. When someone buys a ticket with your link, you earn ${pct(program.eventReferral.rateBps)} of the ticket price in credit after the event.`,
    );
  }
  if (program.promoterCommission) {
    lines.push(
      "Promote events. When an organizer offers a commission, every ticket sold through your share link earns you that share of the price, paid by the organizer as credit after the event.",
    );
  }
  if (program.friendReferral?.referrerMinor) {
    lines.push(
      `Invite a friend. When they buy their first ticket, you get ${formatCredit(program.friendReferral.referrerMinor)}${
        program.friendReferral.refereeMinor
          ? ` and they get ${formatCredit(program.friendReferral.refereeMinor)} off`
          : ""
      }.`,
    );
  }
  if (program.loyaltyFeeRebate) {
    const l = program.loyaltyFeeRebate;
    lines.push(
      `Keep going out. Buy tickets to ${l.ordersRequired} different events within ${l.windowDays} days and the service fee on the ${l.ordersRequired === 5 ? "5th" : "last"} order comes back as credit after the event (up to ${formatCredit(l.maxMinor)}).`,
    );
  }
  if (program.organizerRebate) {
    lines.push(
      `Organize events. Each month you get ${pct(program.organizerRebate.netShareBps)} of what Abonten earned on your events that ended the month before, as promotion credit to feature your next one.`,
    );
  }
  if (program.venueRebate) {
    lines.push(
      `Own a verified place? When other organizers hold ticketed events there, you get ${pct(program.venueRebate.netShareBps)} of what Abonten earned on them, as promotion credit.`,
    );
  }
  if (program.placeVisits) {
    lines.push(
      `Own a verified place? Show your check-in code: every different person who checks in during a month earns you ${formatCredit(program.placeVisits.perVisitorMinor)} of promotion credit (up to ${program.placeVisits.maxVisitors} a month).`,
    );
  }
  if (program.organizerMilestone) {
    lines.push(
      `The first time one of your events sells to ${program.organizerMilestone.uniqueBuyers} different people, you get ${formatCredit(program.organizerMilestone.amountMinor)} of promotion credit.`,
    );
  }
  return lines;
}

/** The loyalty card: how far along the caller is. */
export function loyaltyProgressCopy(p: LoyaltyProgress): {
  headline: string;
  detail: string;
} {
  const left = Math.max(p.ordersRequired - p.ordersCounted, 0);
  const cap = formatCredit(p.maxPerRewardMinor);
  const min =
    p.minOrderMinor > 0 ? ` of ${formatCredit(p.minOrderMinor)} or more` : "";
  if (left === 0) {
    return {
      headline: `${p.ordersCounted} of ${p.ordersRequired} events`,
      detail: `Your service fee on the last order comes back as credit after that event (up to ${cap}).`,
    };
  }
  return {
    headline: `${p.ordersCounted} of ${p.ordersRequired} events`,
    detail:
      left === 1
        ? `One more ticket order${min} to a different event within ${p.windowDays} days and we give you back its service fee as credit (up to ${cap}).`
        : `${left} more ticket orders${min} to different events within ${p.windowDays} days and we give you back the service fee on the last one as credit (up to ${cap}).`,
  };
}
