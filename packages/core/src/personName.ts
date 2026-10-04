import type { CoreTranslator } from "./i18n/translator";

// A deleted account keeps what it wrote (reviews, messages, comments) under
// a scrubbed profile: anonymize_deleted_account() sets the username to
// "deleted_" and the first twelve hex digits of the id, and the name to the
// English words "Deleted user". Those words are data, not a message, so a
// screen recognises the account by its username — nobody else may take one
// (@abonten/validation editProfileSchema) — and names it in the reader's
// language. Words live under `member.*` of the core namespace.

const DELETED_ACCOUNT_USERNAME = /^deleted_[0-9a-f]{12}$/i;

export function isDeletedAccount(username: string | null | undefined): boolean {
  return !!username && DELETED_ACCOUNT_USERNAME.test(username);
}

export type NamedPerson = {
  username?: string | null;
  full_name?: string | null;
};

/**
 * The name a person is shown under: their name, else their username; a
 * deleted account is a "Former Abonten member". Null when there is nothing
 * to show, so the caller keeps its own fallback.
 */
export function personName(
  t: CoreTranslator,
  person: NamedPerson | null | undefined,
): string | null {
  if (!person) return null;
  if (isDeletedAccount(person.username)) return t("member.former");
  return person.full_name || person.username || null;
}

/** The @handle to show beside a name; none for a deleted account. */
export function personHandle(
  person: NamedPerson | null | undefined,
): string | null {
  if (!person?.username || isDeletedAccount(person.username)) return null;
  return person.username;
}
