import "server-only";

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  type ParsedMarkdown,
  parseFrontMatter,
  parseMarkdown,
} from "@abonten/core/markdown/parseMarkdown";

// Public documents (legal pages, help centre) are Markdown files under
// apps/web/src/content. They are read at build time by static server
// components — the pages carry no dynamic API, so Next prerenders them and
// no file is read per request. Keeping the files inside the web app (rather
// than the repo-level docs/ folder) guarantees they exist in the Vercel build
// context whatever the project's root-directory setting is. Everything in
// docs/ is internal; everything here is public by definition.

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");

export type LegalSlug = "terms" | "privacy" | "cookies" | "security";

export const LEGAL_DOCUMENTS: Record<LegalSlug, { file: string }> = {
  terms: { file: "terms.md" },
  privacy: { file: "privacy-policy.md" },
  cookies: { file: "cookie-policy.md" },
  security: { file: "security.md" },
};

export function isLegalSlug(value: string): value is LegalSlug {
  return value in LEGAL_DOCUMENTS;
}

export type PublicDocument = ParsedMarkdown & {
  slug: string;
  title: string;
  summary: string | null;
  version: string | null;
  effectiveDate: string | null;
  lastUpdated: string | null;
  status: string | null;
};

function toDocument(slug: string, source: string): PublicDocument {
  const parsed = parseMarkdown(source);
  const fm = parsed.frontMatter;
  return {
    ...parsed,
    slug,
    title: fm.title ?? slug,
    summary: fm.summary ?? null,
    version: fm.version ?? null,
    effectiveDate: fm.effectiveDate ?? null,
    lastUpdated: fm.lastUpdated ?? null,
    status: fm.status ?? null,
  };
}

export function loadLegalDocument(slug: LegalSlug): PublicDocument {
  const file = path.join(CONTENT_ROOT, "legal", LEGAL_DOCUMENTS[slug].file);
  return toDocument(slug, readFileSync(file, "utf8"));
}

// ---- help centre ------------------------------------------------------------

export const HELP_SECTIONS = [
  { dir: "customers", label: "For customers" },
  { dir: "organizers", label: "For organizers" },
  { dir: "place-owners", label: "For place owners" },
  { dir: "account", label: "Account, privacy and safety" },
] as const;

export type HelpSectionDir = (typeof HELP_SECTIONS)[number]["dir"];

export type HelpPageMeta = {
  section: HelpSectionDir;
  slug: string;
  title: string;
  summary: string | null;
  order: number;
  href: string;
};

function isHelpSection(value: string): value is HelpSectionDir {
  return HELP_SECTIONS.some((s) => s.dir === value);
}

/** Every help page's front matter, grouped by section and sorted by `order` then title. */
export function listHelpPages(): HelpPageMeta[] {
  const out: HelpPageMeta[] = [];
  for (const section of HELP_SECTIONS) {
    const dir = path.join(CONTENT_ROOT, "help", section.dir);
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const full = path.join(dir, entry);
      if (!statSync(full).isFile()) continue;
      const { frontMatter } = parseFrontMatter(readFileSync(full, "utf8"));
      const slug = entry.replace(/\.md$/, "");
      out.push({
        section: section.dir,
        slug,
        title: frontMatter.title ?? slug,
        summary: frontMatter.summary ?? null,
        order: Number.parseInt(frontMatter.order ?? "999", 10) || 999,
        href: `/help/${section.dir}/${slug}`,
      });
    }
  }
  return out.sort(
    (a, b) =>
      HELP_SECTIONS.findIndex((s) => s.dir === a.section) -
        HELP_SECTIONS.findIndex((s) => s.dir === b.section) ||
      a.order - b.order ||
      a.title.localeCompare(b.title),
  );
}

export function loadHelpPage(
  section: string,
  slug: string,
): PublicDocument | null {
  if (!isHelpSection(section)) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const file = path.join(CONTENT_ROOT, "help", section, `${slug}.md`);
  try {
    return toDocument(slug, readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
