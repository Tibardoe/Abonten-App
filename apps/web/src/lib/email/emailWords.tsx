import type { ServerTranslator } from "@abonten/i18n/server";
import { emailT } from "@abonten/services/i18n/requestLocale";
import { userLocale } from "@abonten/services/i18n/userLocale";
import type { ReactNode } from "react";

// What an email template is given to speak the recipient's language: the
// `emails` namespace translator, the language itself (for <html lang>, the
// subject and any date it formats), and the greeting.

export type EmailWords = {
  locale: string;
  t: ServerTranslator;
  /** "Hi Ama," / "Hi there," */
  greeting: string;
};

export function emailWords(
  locale: string | null | undefined,
  name: string | null | undefined,
): EmailWords {
  const t = emailT(locale);
  return {
    locale: locale ?? "en",
    t,
    greeting: t("common.hi", { name: name?.trim() || t("common.there") }),
  };
}

/** The words for one recipient, in the language saved on their account. */
export async function emailWordsFor(
  userId: string | null | undefined,
  name: string | null | undefined,
): Promise<EmailWords> {
  return emailWords(await userLocale(userId), name);
}

/**
 * An ICU message with inline tags for a React email. use-intl's server
 * translator returns plain text, so the tags are resolved here: each
 * `<name>…</name>` becomes what `tags[name]` makes of its content.
 */
export function richEmailText(
  text: string,
  tags: Record<string, (chunk: string) => ReactNode>,
): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = tags[m[1]];
    out.push(render ? <span key={i++}>{render(m[2])}</span> : m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
