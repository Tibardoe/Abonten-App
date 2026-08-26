import PageHeader from "@/components/molecules/PageHeader";
import FinancesDesktopSidebar from "@/finances/organisms/FinancesDesktopSidebar";
import FinancesMobileTabs from "@/finances/organisms/FinancesMobileTabs";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function FinancesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex flex-col gap-6">
      <PageHeader title="Finances" />

      <FinancesMobileTabs />

      <section className="flex flex-col lg:flex-row lg:gap-10">
        <div className="hidden lg:block">
          <FinancesDesktopSidebar />
        </div>

        <div className="flex-1 min-w-0">{children}</div>
      </section>
    </main>
  );
}
