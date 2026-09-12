import ContactSupportCard from "@/components/molecules/ContactSupportCard";
import MarkdownDocument from "@/components/organisms/MarkdownDocument";
import {
  HELP_SECTIONS,
  listHelpPages,
  loadHelpPage,
} from "@/utils/publicContent";
import type { Metadata } from "next";
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
  params: Promise<{ section: string; slug: string }>;
}): Promise<Metadata> {
  const { section, slug } = await params;
  const doc = loadHelpPage(section, slug);
  if (!doc) return { title: "Help centre — Abonten Hub" };
  return {
    title: `${doc.title} — Abonten Help`,
    description: doc.summary ?? undefined,
    alternates: { canonical: `/help/${section}/${slug}` },
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}) {
  const { section, slug } = await params;
  const doc = loadHelpPage(section, slug);
  if (!doc) notFound();

  const pages = listHelpPages();
  const sectionLabel =
    HELP_SECTIONS.find((s) => s.dir === section)?.label ?? "Help";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 py-6 lg:flex-row lg:gap-12">
      <aside className="lg:sticky lg:top-28 lg:w-64 lg:shrink-0 lg:self-start">
        <Link
          href="/help"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Help centre
        </Link>
        {HELP_SECTIONS.map((s) => {
          const items = pages.filter((p) => p.section === s.dir);
          if (items.length === 0) return null;
          return (
            <div key={s.dir} className="mt-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {s.label}
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
        <MarkdownDocument blocks={doc.blocks} />
        {doc.lastUpdated ? (
          <p className="mt-8 text-xs text-muted-foreground">
            Last updated {doc.lastUpdated}
          </p>
        ) : null}
        <div className="mt-10">
          <ContactSupportCard />
        </div>
      </article>
    </div>
  );
}
