import {
  localizeEnvelope,
  runWithLocale,
} from "@abonten/services/i18n/requestLocale";
import { getLocale } from "next-intl/server";

// Every Server Action is exported through this. It binds the visitor's
// language for the whole call (the services word their messages with it,
// through AsyncLocalStorage — a service never takes a locale argument) and,
// on the way out, translates a `message` the database wrote. An action
// called where no request language exists (a cron route, a test) runs in
// English.
export function withActionLocale<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    let locale: string | null = null;
    try {
      locale = await getLocale();
    } catch {
      // Outside a request: English.
    }
    return runWithLocale(locale, async () =>
      localizeEnvelope(await action(...args)),
    );
  };
}
