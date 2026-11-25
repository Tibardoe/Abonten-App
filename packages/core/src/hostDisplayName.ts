import type { CoreTranslator } from "./i18n/translator";
import { isDeletedAccount } from "./personName";

type Host = {
  username?: string | null;
  full_name?: string | null;
  username_is_generated?: boolean | null;
};

// The name shown for the person or business behind a listing ("Hosted by").
// A username the person chose is their public name. A username we made up
// for them (user12345678, `username_is_generated`) is only a placeholder,
// so their full name is shown instead while they have one: an organiser
// listed for them by the field team otherwise reads as "Hosted by
// user16673156" until they sign in and choose a username.
export function hostDisplayName(u: Host): string {
  const fullName = u.full_name?.trim();
  if (u.username_is_generated && fullName) return fullName;
  return u.username ?? fullName ?? "";
}

/**
 * hostDisplayName in the reader's language: an organizer whose account was
 * deleted is a "Former Abonten member" (its scrubbed name and handle are
 * data, never shown). Use isDeletedAccount(username) to drop the profile
 * link and the Message button beside it.
 */
export function hostName(t: CoreTranslator, u: Host): string {
  if (isDeletedAccount(u.username)) return t("member.former");
  return hostDisplayName(u);
}
