import "server-only";

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { formatDate } from "@abonten/core/i18n/format";
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

/**
 * A front-matter calendar day ("2026-10-04") in the reader's language, or
 * null when the value is not a day ("Not yet in force — set when approved").
 */
export function formatDocumentDay(
  value: string | null,
  locale: string,
): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return formatDate(value, locale, { dateStyle: "long", timeZone: "UTC" });
}

// Legal documents stay in English until counsel approves a text and its
// translation (OPERATIONAL_DECISIONS_REQUIRED.md D5); the pages say so.
export function loadLegalDocument(slug: LegalSlug): PublicDocument {
  const file = path.join(CONTENT_ROOT, "legal", LEGAL_DOCUMENTS[slug].file);
  return toDocument(slug, readFileSync(file, "utf8"));
}

// ---- help centre ------------------------------------------------------------
//
// English pages are <section>/<slug>.md. A translation sits beside its page
// as <slug>.<locale>.md (French, Spanish, German, Portuguese); a page with no
// translation is shown in English, marked so. Section names are messages
// (`help.section*`), never words in this file.

export const HELP_SECTIONS = [
  { dir: "customers" },
  { dir: "organizers" },
  { dir: "place-owners" },
  { dir: "account" },
] as const;

export type HelpSectionDir = (typeof HELP_SECTIONS)[number]["dir"];

/** The languages the help centre is written in besides English. */
export const HELP_TRANSLATIONS = ["fr", "es", "de", "pt"] as const;

const TRANSLATION_FILE = /\.([a-z]{2})\.md$/;

export type HelpPageMeta = {
  section: HelpSectionDir;
  slug: string;
  title: string;
  summary: string | null;
  order: number;
  href: string;
};

export function isHelpSection(value: string): value is HelpSectionDir {
  return HELP_SECTIONS.some((s) => s.dir === value);
}

function helpTranslationOf(locale: string | null | undefined): string | null {
  return locale && (HELP_TRANSLATIONS as readonly string[]).includes(locale)
    ? locale
    : null;
}

/**
 * A page's Markdown in `locale` (the English page where it is not
 * translated), and whether it is translated; null when there is no page.
 * Each read builds its path in place: the bundler traces these files from
 * the expression, and a path handed over from another function would make
 * it trace the whole project instead.
 */
function readHelpSource(
  section: HelpSectionDir,
  slug: string,
  locale: string | null | undefined,
): { source: string; translated: boolean } | null {
  const lang = helpTranslationOf(locale);
  if (lang) {
    try {
      const translation = path.join(
        CONTENT_ROOT,
        "help",
        section,
        `${slug}.${lang}.md`,
      );
      return { source: readFileSync(translation, "utf8"), translated: true };
    } catch {
      // No translation yet: the English page.
    }
  }
  try {
    const english = path.join(CONTENT_ROOT, "help", section, `${slug}.md`);
    return { source: readFileSync(english, "utf8"), translated: false };
  } catch {
    return null;
  }
}

/**
 * Every help page's front matter in `locale` (English where a page is not
 * translated), grouped by section and sorted by `order` then title.
 */
export function listHelpPages(locale?: string | null): HelpPageMeta[] {
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
      if (!entry.endsWith(".md") || TRANSLATION_FILE.test(entry)) continue;
      if (!statSync(path.join(dir, entry)).isFile()) continue;
      const slug = entry.replace(/\.md$/, "");
      const read = readHelpSource(section.dir, slug, locale);
      if (!read) continue;
      const { frontMatter } = parseFrontMatter(read.source);
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
      a.title.localeCompare(b.title, locale ?? undefined),
  );
}

export function loadHelpPage(
  section: string,
  slug: string,
  locale?: string | null,
): (PublicDocument & { translated: boolean }) | null {
  if (!isHelpSection(section)) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const read = readHelpSource(section, slug, locale);
  if (!read) return null;
  return { ...toDocument(slug, read.source), translated: read.translated };
}
