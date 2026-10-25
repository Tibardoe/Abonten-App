import SegmentMessages from "@/i18n/SegmentMessages";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// The buyer's Balance: personal, signed in, never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ticketPlans");
  return {
    title: { default: t("balance"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SegmentMessages segment="balance">{children}</SegmentMessages>;
}
