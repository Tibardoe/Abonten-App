import ContactSupportCard from "@/components/molecules/ContactSupportCard";
import MarkdownDocument from "@/components/organisms/MarkdownDocument";
import {
  HELP_SECTIONS,
  type HelpSectionDir,
  formatDocumentDay,
  isHelpSection,
  listHelpPages,
  loadHelpPage,
} from "@/utils/publicContent";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return listHelpPages().map((p) => ({ section: p.section, slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; section: string; slug: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("help");

  const { locale, section, slug } = await params;
  const doc = loadHelpPage(section, slug, locale);
  if (!doc) return { title: t("helpCentre") };
  return {
    title: t("helpCentre3", { title: doc.title }),
    description: doc.summary ?? undefined,
    alternates: { canonical: `/help/${section}/${slug}` },
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ locale: string; section: string; slug: string }>;
}) {
  const t = await getTranslations("help");

  const { locale, section, slug } = await params;
  const doc = loadHelpPage(section, slug, locale);
  if (!doc) notFound();

  const pages = listHelpPages(locale);
  const labelOf = (dir: HelpSectionDir) => {
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
  const sectionLabel = isHelpSection(section) ? labelOf(section) : t("help");
  const lastUpdated = formatDocumentDay(doc.lastUpdated, locale);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 py-6 lg:flex-row lg:gap-12">
      <aside className="lg:sticky lg:top-28 lg:w-64 lg:shrink-0 lg:self-start">
        <Link
          href="/help"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("helpCentre2")}
        </Link>
        {HELP_SECTIONS.map((s) => {
          const items = pages.filter((p) => p.section === s.dir);
          if (items.length === 0) return null;
          return (
            <div key={s.dir} className="mt-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {labelOf(s.dir)}
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {items.map((p) => {
                  const active = p.section === section && p.slug === slug;
                  return (
                    <li key={p.href}>
                      <Link
                        href={p.href}
                        aria-current={active ? "page" : undefined}
                        className={
                          active
                            ? "font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }
                      >
                        {p.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </aside>

      <article className="min-w-0 flex-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {sectionLabel}
        </p>
        {!doc.translated && locale !== "en" ? (
          <p className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {t("notTranslatedYet")}
          </p>
        ) : null}
        {/* An untranslated page is English text inside a page in another
            language; screen readers need to know to read it as English. */}
        <div lang={doc.translated || locale === "en" ? undefined : "en"}>
          <MarkdownDocument blocks={doc.blocks} />
        </div>
        {lastUpdated ? (
          <p className="mt-8 text-xs text-muted-foreground">
            {t("lastUpdated", { lastUpdated })}
          </p>
        ) : null}
        <div className="mt-10">
          <ContactSupportCard />
        </div>
      </article>
    </div>
  );
}
