import {
  type ProfileCompletion,
  leadingIncompleteItem,
} from "./profileCompletion";

// When the "Finish setting up your account" reminder card may appear.
//
// A helpful reminder, not a nag:
//   * never a modal, never on a timer — a card in the page that can be put
//     away with one tap;
//   * gone for good once every step is done;
//   * each "put away" silences it for longer: 7 days, then 30, then 90
//     (every later dismissal keeps the 90);
//   * steps an action actually needs (an email to pay) are asked for at
//     that moment instead, and those contextual asks are never silenced
//     by this card's dismissal.
//
// Dismissals are stored per account (account_setup_prompt_state, migration
// 20260923090100) so putting it away on one device holds on the others.

export const ACCOUNT_SETUP_QUIET_DAYS = [7, 30, 90] as const;

const DAY_MS = 86_400_000;

export type AccountSetupPromptState = {
  dismissCount: number;
  dismissedAt: string | null;
};

export function accountSetupQuietDays(dismissCount: number): number {
  if (dismissCount <= 0) return 0;
  const index = Math.min(dismissCount, ACCOUNT_SETUP_QUIET_DAYS.length) - 1;
  return ACCOUNT_SETUP_QUIET_DAYS[index] ?? 90;
}

export function accountSetupPromptVisible(
  completion: ProfileCompletion | null | undefined,
  state: AccountSetupPromptState | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!completion || completion.isComplete) return false;
  if (!state?.dismissedAt || state.dismissCount <= 0) return true;
  const dismissedAt = new Date(state.dismissedAt).getTime();
  if (!Number.isFinite(dismissedAt)) return true;
  return (
    now - dismissedAt >= accountSetupQuietDays(state.dismissCount) * DAY_MS
  );
}

/** The card's one line — about the step that matters most right now. */
export function accountSetupPromptMessage(completion: ProfileCompletion): {
  title: string;
  body: string;
} {
  const lead = leadingIncompleteItem(completion);
  const title = "Finish setting up your account";
  switch (lead?.key) {
    case "email":
      return {
        title,
        body:
          lead.state === "unverified"
            ? "Confirm your email so you can pay for tickets and get them by email."
            : "Add your email so you can pay for tickets and get them by email.",
      };
    case "phone":
      return {
        title,
        body: "Add a phone number as a second way to sign in if you can't get into your email or Google account.",
      };
    case "username":
    case "name":
    case "avatar":
      return {
        title,
        body: "Add your name, a username and a photo so people recognise you on your profile and reviews.",
      };
    default:
      return { title, body: "A few quick steps left." };
  }
}
