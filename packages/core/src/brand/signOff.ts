// The brand's sign-off: Abonten names, "Connecting people to experiences"
// explains, and the Entertainment Department, Earth Branch signs. It closes
// things — the end of the homepage, the end of an Abonten Weekly edition —
// and never appears on money, tickets, support, legal pages or errors.
// Kept here so every use can be found (and changed) in one place.

/** The office credit line, e.g. at the foot of the homepage. */
export const SIGN_OFF_CREDIT =
  "Entertainment Department, Earth Branch · Accra Office";

/** "[Verb] by the Entertainment Department, Earth Branch" — the repeatable form. */
export function signOff(verb: "Compiled" | "Packed" | "Filed" | "Signed") {
  return `${verb} by the Entertainment Department, Earth Branch`;
}
