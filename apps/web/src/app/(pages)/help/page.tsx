import ContactSupportCard from "@/components/molecules/ContactSupportCard";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { HELP_SECTIONS, listHelpPages } from "@/utils/publicContent";
import type { Metadata } from "next";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// The public help centre hub. Pages are Markdown files under
// apps/web/src/content/help/<section>/<slug>.md, rendered at build time.
// Public (allow-listed in config/supabase/middleware.ts).

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Help centre — Abonten Hub",
  description:
    "How to find events and places, buy and use tickets, run events, manage a place, and look after your Abonten account.",
};

export default function HelpIndexPage() {
  const pages = listHelpPages();

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-8 py-6">
      <div className="flex flex-col gap-2">
        <PageTitle>Help centre</PageTitle>
        <SupportingText>
          Step-by-step guides for customers, organizers and place owners, on the
          web and in the Abonten app.
        </SupportingText>
      </div>

      {HELP_SECTIONS.map((section) => {
        const items = pages.filter((p) => p.section === section.dir);
        if (items.length === 0) return null;
        return (
          <div key={section.dir} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{section.label}</h2>
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
