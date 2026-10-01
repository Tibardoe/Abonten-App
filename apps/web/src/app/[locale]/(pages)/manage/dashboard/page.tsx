export const dynamic = "force-dynamic";

import OrganizerDashboard from "@/components/organisms/OrganizerDashboard";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("manage");
  return { title: t("organizerDashboard") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function page() {
  return (
    <div className="flex flex-col gap-5">
      <OrganizerDashboard />
    </div>
  );
}
