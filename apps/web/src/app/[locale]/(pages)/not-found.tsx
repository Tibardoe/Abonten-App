import PageNotFound from "@/components/molecules/PageNotFound";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("pageNotFound"),
    robots: { index: false, follow: false },
  };
}

// Rendered by notFound() anywhere under the main layout, so the header and
// navigation stay in place around the message.
export default function NotFound() {
  return <PageNotFound />;
}
