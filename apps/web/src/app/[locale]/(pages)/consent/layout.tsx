import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// One-time consent links: never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("fieldOps");
  return {
    // A layout that sets its own title must restate the template, or its
    // pages' titles lose " | Abonten Hub".
    title: { default: t("consent"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
