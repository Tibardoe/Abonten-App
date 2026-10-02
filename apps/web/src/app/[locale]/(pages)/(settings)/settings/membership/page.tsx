import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("membership") };
}

// The Membership product was removed — see /settings/overview's Promotion
// Details section, and Manage → Events/Places → Promotion for the current
// resource-specific promotion packages. Kept only so old bookmarks/links land
// somewhere useful instead of 404ing.
export default function page() {
  redirect("/settings/overview");
}
