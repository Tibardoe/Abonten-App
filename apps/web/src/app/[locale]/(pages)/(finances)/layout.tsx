import PageHeader from "@/components/molecules/PageHeader";
import FinancesDesktopSidebar from "@/finances/organisms/FinancesDesktopSidebar";
import FinancesMobileTabs from "@/finances/organisms/FinancesMobileTabs";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

// Organizer money pages: never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finances");
  return {
    // A layout that sets its own title must restate the template, or its
    // pages' titles lose " | Abonten Hub".
    title: { default: t("finances"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false },
  };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function FinancesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const t = useTranslations("finances");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("finances")} />

      <FinancesMobileTabs />

      <section className="flex flex-col lg:flex-row lg:gap-10">
        <div className="hidden lg:block">
          <FinancesDesktopSidebar />
        </div>

        <div className="flex-1 min-w-0">{children}</div>
      </section>
    </div>
  );
}
