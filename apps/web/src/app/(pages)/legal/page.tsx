import { PageTitle, SupportingText } from "@/components/ui/typography";
import { LEGAL_DOCUMENTS, loadLegalDocument } from "@/utils/publicContent";
import type { Metadata } from "next";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Legal — Abonten Hub",
  description:
    "Abonten Hub's Terms and Conditions, Privacy Policy, Cookie Policy and security overview.",
};

export default function LegalIndexPage() {
  const docs = (
    Object.keys(LEGAL_DOCUMENTS) as Array<keyof typeof LEGAL_DOCUMENTS>
  ).map((slug) => ({ slug, doc: loadLegalDocument(slug) }));

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <PageTitle>Legal</PageTitle>
        <SupportingText>
          The documents that govern your use of Abonten Hub on the web and in
          the mobile app.
        </SupportingText>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {docs.map(({ slug, doc }) => (
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
                {doc.version ? `Version ${doc.version}` : null}
                {doc.effectiveDate ? ` · Effective ${doc.effectiveDate}` : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
