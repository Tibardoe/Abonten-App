import SegmentMessages from "@/i18n/SegmentMessages";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Personal purchase history: never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("transactions");
  return {
    // A layout that sets its own title must restate the template, or its
    // pages' titles lose " | Abonten Hub".
    title: { default: t("transactions"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false },
  };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SegmentMessages segment="(transactions)">
      <div>
        <section className="flex flex-col w-full gap-10">{children}</section>
      </div>
    </SegmentMessages>
  );
}
