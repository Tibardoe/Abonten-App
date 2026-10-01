import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import MessageLoader from "./MessageLoader";
import { rootMessages } from "./routeMessages";

// The translation provider every page is rendered inside. It hands the
// browser the messages the site chrome reads (header, navigation, footer,
// toasts) and nothing else: each part of the site adds its own through
// <SegmentMessages>, and MessageLoader fetches the rest on demand. Server
// Components are not affected: they translate on the server from the full
// catalogs (i18n/request.ts) and send text.
//
// Language and time zone are inherited from the request configuration.
export default async function RootMessages({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, all] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider messages={rootMessages(locale, all)}>
      <MessageLoader>{children}</MessageLoader>
    </NextIntlClientProvider>
  );
}
