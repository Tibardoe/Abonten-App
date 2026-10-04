import ContactSupportCard from "@/components/molecules/ContactSupportCard";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { languageAlternates } from "@/i18n/alternates";
import {
  HELP_SECTIONS,
  type HelpSectionDir,
  listHelpPages,
} from "@/utils/publicContent";
import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// The public help centre hub. Pages are Markdown files under
// apps/web/src/content/help/<section>/<slug>.md (and <slug>.<locale>.md for
// their translations), rendered at build time once per language.
// Public (allow-listed in config/supabase/middleware.ts).

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return {
    title: t("helpCentre"),
    description: t("howToFindEventsAndPlaces"),
    alternates: languageAlternates("/help", await getLocale()),
  };
}

export default function HelpIndexPage() {
  const t = useTranslations("help");
  const locale = useLocale();

  const pages = listHelpPages(locale);
  const sectionLabel = (dir: HelpSectionDir) => {
    switch (dir) {
      case "customers":
        return t("sectionCustomers");
      case "organizers":
        return t("sectionOrganizers");
      case "place-owners":
        return t("sectionPlaceOwners");
      case "account":
        return t("sectionAccount");
    }
  };

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-8 py-6">
      <div className="flex flex-col gap-2">
        <PageTitle>{t("helpCentre")}</PageTitle>
        <SupportingText>{t("stepByStepGuidesForCustomers")}</SupportingText>
      </div>

      {HELP_SECTIONS.map((section) => {
        const items = pages.filter((p) => p.section === section.dir);
        if (items.length === 0) return null;
        return (
          <div key={section.dir} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              {sectionLabel(section.dir)}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((page) => (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">{page.title}</span>
                    {page.summary ? (
                      <span className="text-sm text-muted-foreground">
                        {page.summary}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <ContactSupportCard />
    </section>
  );
}
