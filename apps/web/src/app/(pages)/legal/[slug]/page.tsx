import MarkdownDocument from "@/components/organisms/MarkdownDocument";
import {
  LEGAL_DOCUMENTS,
  type LegalSlug,
  isLegalSlug,
  loadLegalDocument,
} from "@/utils/publicContent";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// /legal/terms · /legal/privacy · /legal/cookies · /legal/security — the
// public policies, rendered from apps/web/src/content/legal/*.md at build
// time. Public (allow-listed in config/supabase/middleware.ts) because the
// mobile sign-in screen and every email footer link here for people who are
// not signed in.

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return (Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]).map((slug) => ({
    slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return { title: "Legal — Abonten Hub" };
  const doc = loadLegalDocument(slug);
  return {
    title: `${doc.title} — Abonten Hub`,
    description: doc.summary ?? undefined,
    alternates: { canonical: `/legal/${slug}` },
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const doc = loadLegalDocument(slug);
  const others = (Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]).filter(
    (s) => s !== slug,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 py-6 lg:flex-row lg:gap-12">
      <aside className="lg:sticky lg:top-28 lg:w-64 lg:shrink-0 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          On this page
        </p>
        <nav aria-label="Sections">
          <ul className="flex flex-col gap-1 text-sm">
            {doc.headings
              .filter((h) => h.level === 2)
              .map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {h.text}
                  </a>
                </li>
              ))}
          </ul>
        </nav>
        <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Other documents
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {others.map((s) => (
            <li key={s}>
              <Link
                href={`/legal/${s}`}
                className="text-muted-foreground hover:text-foreground"
              >
                {loadLegalDocument(s).title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <article className="min-w-0 flex-1">
        <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          {doc.version ? <span>Version {doc.version}</span> : null}
          {doc.effectiveDate ? (
            <span> · Effective {doc.effectiveDate}</span>
          ) : null}
          {doc.lastUpdated ? (
            <span> · Last updated {doc.lastUpdated}</span>
          ) : null}
          {doc.status ? <span> · Status: {doc.status}</span> : null}
        </div>
        <MarkdownDocument blocks={doc.blocks} />
      </article>
    </div>
  );
}
