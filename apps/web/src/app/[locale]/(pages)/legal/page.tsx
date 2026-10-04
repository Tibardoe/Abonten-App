import { PageTitle, SupportingText } from "@/components/ui/typography";
import {
  LEGAL_DOCUMENTS,
  formatDocumentDay,
  loadLegalDocument,
} from "@/utils/publicContent";
import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return {
    title: t("legal"),
    description: t("abontenHubSTermsAndConditions"),
  };
}

export default function LegalIndexPage() {
  const t = useTranslations("legal");
  const locale = useLocale();

  const docs = (
    Object.keys(LEGAL_DOCUMENTS) as Array<keyof typeof LEGAL_DOCUMENTS>
  ).map((slug) => {
    const doc = loadLegalDocument(slug);
    return {
      slug,
      doc,
      effectiveDate: formatDocumentDay(doc.effectiveDate, locale),
    };
  });

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <PageTitle>{t("legal")}</PageTitle>
        <SupportingText>{t("theDocumentsThatGovernYourUse")}</SupportingText>
        {locale !== "en" ? (
          <SupportingText>{t("englishOnly")}</SupportingText>
        ) : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {docs.map(({ slug, doc, effectiveDate }) => (
          <li key={slug}>
            <Link
              href={`/legal/${slug}`}
              className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
            >
              <span className="font-semibold">{doc.title}</span>
              {doc.summary ? (
                <span className="text-sm text-muted-foreground">
                  {doc.summary}
                </span>
              ) : null}
              <span className="mt-auto pt-2 text-xs text-muted-foreground">
                {doc.version ? t("version", { version: doc.version }) : null}
                {effectiveDate
                  ? t("effective2", { effectiveDate })
                  : doc.effectiveDate
                    ? t("notInForce2")
                    : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
