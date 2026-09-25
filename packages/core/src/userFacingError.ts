// What a person is told when a database or provider call fails. The raw
// error — table, column and constraint names, SQL fragments — goes to the
// log, never into a response: it helps no one fix anything and describes
// the schema to whoever is probing it.

import { logger } from "./logger";

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// Messages Postgres / PostgREST write themselves. Anything else that comes
// back from the database was written by one of Abonten's own functions or
// triggers (`raise exception '…'`, whatever SQLSTATE it chose) for people
// to read, and is passed through.
const SYSTEM_MESSAGE =
  /violates|duplicate key|permission denied|invalid input|syntax error|relation "|column "|function |does not exist|could not find|JSON object requested|schema cache|null value in|out of range|value too long|deadlock|canceling statement|timeout|fetch failed|network|ECONN|PGRST/i;

/**
 * Logs `context: <error>` and returns what the person should read: the
 * error's own text when an Abonten database function raised it on purpose,
 * otherwise the generic message.
 */
export function userFacingError(
  context: string,
  error: { message?: string; code?: string } | null | undefined,
): string {
  const text = error?.message ?? "";
  logger.error(`${context}: ${text || "unknown error"}`);
  if (text && text.length <= 300 && !SYSTEM_MESSAGE.test(text)) return text;
  return GENERIC_ERROR_MESSAGE;
}

/** Whether a database error's text was written by Postgres itself. */
export function isSystemDbMessage(text: string | null | undefined): boolean {
  return !text || SYSTEM_MESSAGE.test(text);
}
