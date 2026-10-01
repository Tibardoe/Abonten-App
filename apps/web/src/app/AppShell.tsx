import "./globals.css";
import { euclidCircular } from "@/app/fonts";
import LocaleProvider from "@/i18n/LocaleProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import ToastProvider from "@/providers/ToastProvider";
import InviteBinder from "@/rewards/atoms/InviteBinder";
import ReferralTouchLogger from "@/rewards/atoms/ReferralTouchLogger";
import { NextIntlClientProvider } from "next-intl";

// The document every page is rendered in: <html lang>, the brand font, and
// the provider stack (theme, language, data cache, toasts). The root layout
// under app/[locale] uses it for every page; app/global-not-found.tsx uses
// it too, because an address that matches no route at all is rendered
// outside the [locale] layout and would otherwise get a bare document.
export default function AppShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <html
      lang={locale}
      className={`${euclidCircular.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Locale, messages and time zone are inherited from the request
              configuration (i18n/request.ts) — nothing is passed here. */}
          <NextIntlClientProvider>
            <LocaleProvider>
              <ReactQueryProvider>
                <ToastProvider>
                  {children}
                  <ReferralTouchLogger />
                  <InviteBinder />
                </ToastProvider>
              </ReactQueryProvider>
            </LocaleProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
