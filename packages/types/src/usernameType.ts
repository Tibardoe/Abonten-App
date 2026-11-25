// The as-you-type username check (docs/architecture/team-accounts.md §4n),
// for people and teams. Codes only: the words come from i18n.

/** Why a handle is not well formed (@abonten/core/usernames/usernames). */
export type UsernameProblemCode = "short" | "long" | "characters" | "reserved";

export type UsernameAvailability = {
  /** The handle checked, as typed (without the @). */
  username: string;
  /**
   * available: free to save. taken: another account has it, or gave it up
   * in the last 30 days (held for them). yours: the account already has it.
   * invalid: not a well-formed handle (see `problem`); nothing was looked up.
   */
  state: "available" | "taken" | "yours" | "invalid";
  problem: UsernameProblemCode | null;
  /** Two or three free handles to offer instead (taken only). */
  suggestions: string[];
};
