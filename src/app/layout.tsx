import { GeistMono } from "geist/font/mono";
// import { Geist, Geist_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/context/authProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import localFont from "next/font/local";
// import { NextIntlClientProvider, hasLocale } from "next-intl";
// import { notFound } from "next/navigation";
// import { routing } from "@/i18n/routing";

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

const euclid = localFont({
  src: [
    {
      path: "../../public/fonts/EuclidCircularB-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/EuclidCircularB-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/EuclidCircularB-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/EuclidCircularB-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-euclidCircular",
});

export const metadata: Metadata = {
  title:
    "Abonten | Explore Events Near You | Post Events for Others to Attend Real-Time",
  description: "Explore and attend real-time events",
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
    <html lang="en" className={`${euclid.variable}`}>
      <body
      // className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReactQueryProvider>
          <Providers>
            <main>{children}</main>
          </Providers>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
