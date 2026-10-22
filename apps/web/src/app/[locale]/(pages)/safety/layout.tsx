import SegmentMessages from "@/i18n/SegmentMessages";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Personal, signed-in page: never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("safety");
  return {
    // A layout that sets its own title must restate the template, or its
    // pages' titles lose " | Abonten Hub".
    title: { default: t("title"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SegmentMessages segment="safety">{children}</SegmentMessages>;
}
