// The brand's sign-off: Abonten names, "Connecting people to experiences"
// explains, and "Entertainment Department, Earth Branch" signs. The idea:
// on planet Earth, Abonten is the entertainment department — so there is no
// office or city line; Earth is the branch. It closes things (the end of the
// homepage, the end of an Abonten Weekly edition) and never appears on money,
// tickets, support, legal pages or errors. Kept here so every use can be
// found, and changed, in one place.

/** The sign-off on its own, e.g. the credit line at the foot of the homepage. */
export const SIGN_OFF = "Entertainment Department, Earth Branch";

/** "[Verb] by the Entertainment Department, Earth Branch" — the repeatable form. */
export function signOff(verb: "Compiled" | "Packed" | "Filed" | "Signed") {
  return `${verb} by the ${SIGN_OFF}`;
}
