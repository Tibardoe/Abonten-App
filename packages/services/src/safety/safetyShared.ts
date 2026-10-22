import { tr } from "../i18n/requestLocale";

// What every Safety service answers with. Messages are worded when they are
// answered, in the language of the request (tr binds per request).

export type SafetyEnvelope<T = undefined> = {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500;
  message?: string;
  data?: T;
};

export const safetyFail = (): SafetyEnvelope<never> => ({
  status: 500,
  message: tr("somethingWentWrongPleaseTryAgain"),
});

export const safetyError = (
  status: SafetyEnvelope["status"],
  key: string,
  values?: Record<string, string | number>,
): SafetyEnvelope<never> => ({ status, message: tr(`safety.${key}`, values) });

/** Postgres error codes the services turn into answers. */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_RAISE = "P0001";
