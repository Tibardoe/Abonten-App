import "./globals.css";
import { euclidCircular } from "@/app/fonts";
import LocaleProvider from "@/i18n/LocaleProvider";
import RootMessages from "@/i18n/RootMessages";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import ToastProvider from "@/providers/ToastProvider";
import InviteBinder from "@/rewards/atoms/InviteBinder";
import ReferralTouchLogger from "@/rewards/atoms/ReferralTouchLogger";

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
          {/* Language and time zone come from the request configuration
              (i18n/request.ts). The browser is handed the messages the
              site chrome reads; each part of the site adds its own
              (i18n/SegmentMessages.tsx). */}
          <RootMessages>
            <LocaleProvider>
              <ReactQueryProvider>
                <ToastProvider>
                  {children}
                  <ReferralTouchLogger />
                  <InviteBinder />
                </ToastProvider>
              </ReactQueryProvider>
            </LocaleProvider>
          </RootMessages>
        </ThemeProvider>
      </body>
    </html>
  );
}
