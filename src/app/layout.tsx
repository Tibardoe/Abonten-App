import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/context/authProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";

export const metadata: Metadata = {
  title: "Abonten Hub | Connecting people to experiences",
  description: "Explore and attend real-time events",
  icons: {
    icon: "/assets/images/abonten-logo-black.svg",
    shortcut: "/assets/images/abonten-logo-only-white.svg",
    apple: "/assets/images/abonten-logo-black.svg",
  },
};

export default async function RootLayout({
  children,
}: // params,
{
  children: React.ReactNode;
  // params: Promise<{ locale: string }>;
}) {
  // // Ensure that the incoming `locale` is valid
  // const { locale } = await params;
  // if (!hasLocale(routing.locales, locale)) {
  //   notFound();
  // }

  return (
    <html
      lang="en"
      className="antialiased"
      style={{ fontFamily: "EuclidCircular, sans-serif" }}
    >
      <body>
        <ReactQueryProvider>
          <Providers>
            <main>{children}</main>
          </Providers>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
