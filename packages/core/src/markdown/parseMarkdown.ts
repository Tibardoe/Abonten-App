// A deliberately small Markdown parser for Abonten's public documents (legal
// pages, help centre). It covers the subset those documents use — front
// matter, headings, paragraphs, lists, tables, blockquotes, fenced code,
// horizontal rules, and inline bold / italic / code / links — and nothing
// else. Output is a typed block tree, so the web app renders it as React
// elements (no HTML string, nothing to sanitise) and the docs validation
// script can read front matter with the same rules. No dependency, no DOM.

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] };

export type BlockNode =
  | {
      type: "heading";
      level: 1 | 2 | 3 | 4;
      id: string;
      children: InlineNode[];
    }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "blockquote"; children: InlineNode[] }
  | { type: "hr" }
  | { type: "code"; lang: string | null; text: string }
  | { type: "table"; header: InlineNode[][]; rows: InlineNode[][][] };

export type HeadingEntry = { id: string; level: number; text: string };

export type ParsedMarkdown = {
  frontMatter: Record<string, string>;
  blocks: BlockNode[];
  headings: HeadingEntry[];
};

/** URL-safe id for a heading, stable across renders ("Data we collect" -> "data-we-collect"). */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Plain-text projection of an inline run (used for heading ids and the TOC). */
export function inlineToText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
          return n.text;
        case "strong":
        case "em":
        case "link":
          return inlineToText(n.children);
      }
    })
    .join("");
}

/**
 * Splits `---` front matter off the top of a document. Values are plain
 * strings; surrounding quotes are dropped. Malformed lines are ignored rather
 * than thrown on — a document with a typo in its metadata still renders, and
 * the validation script reports the missing key.
 */
export function parseFrontMatter(source: string): {
  frontMatter: Record<string, string>;
  body: string;
} {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return { frontMatter: {}, body: source };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return { frontMatter: {}, body: source };
  const frontMatter: Record<string, string> = {};
  for (const raw of lines.slice(1, end)) {
    const m = raw.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontMatter[m[1]] = value;
  }
  return { frontMatter, body: lines.slice(end + 1).join("\n") };
}

// ---- inline ----------------------------------------------------------------

export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) {
      out.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];

    // Backslash escapes the next character.
    if (ch === "\\" && i + 1 < text.length) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    // Inline code: `...`
    if (ch === "`") {
      const close = text.indexOf("`", i + 1);
      if (close !== -1) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // Link: [label](href)
    if (ch === "[") {
      const closeBracket = findClosing(text, i, "[", "]");
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket);
          const href = text.slice(closeBracket + 2, closeParen).trim();
          flush();
          out.push({ type: "link", href, children: parseInline(label) });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Strong: **...**
    if (text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close !== -1 && close > i + 2) {
        flush();
        out.push({
          type: "strong",
          children: parseInline(text.slice(i + 2, close)),
        });
        i = close + 2;
        continue;
      }
    }

    // Emphasis: *...* or _..._ (word-bounded for underscores so snake_case
    // identifiers in prose are left alone).
    if (
      (ch === "*" && text[i + 1] !== "*" && text[i + 1] !== " ") ||
      (ch === "_" && isWordBoundary(text, i))
    ) {
      const close = findEmphasisClose(text, i + 1, ch);
      if (close !== -1) {
        flush();
        out.push({
          type: "em",
          children: parseInline(text.slice(i + 1, close)),
        });
        i = close + 1;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

function isWordBoundary(text: string, i: number): boolean {
  const prev = i === 0 ? " " : text[i - 1];
  return !/[A-Za-z0-9]/.test(prev);
}

function findEmphasisClose(text: string, from: number, marker: string): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] !== marker) continue;
    if (j === from) return -1; // empty emphasis, e.g. "**" handled elsewhere
    if (marker === "_" && /[A-Za-z0-9]/.test(text[j + 1] ?? " ")) continue;
    return j;
  }
  return -1;
}

function findClosing(text: string, open: number, o: string, c: string): number {
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === o) depth++;
    else if (text[j] === c) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

// ---- blocks ----------------------------------------------------------------

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const UL_ITEM = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```\s*([A-Za-z0-9_-]*)\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const { frontMatter, body } = parseFrontMatter(source);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  const headings: HeadingEntry[] = [];
  const usedIds = new Map<string, number>();

  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({
        type: "paragraph",
        children: parseInline(paragraph.join(" ").trim()),
      });
      paragraph = [];
    }
  };

  const uniqueId = (base: string) => {
    const b = base || "section";
    const n = usedIds.get(b) ?? 0;
    usedIds.set(b, n + 1);
    return n === 0 ? b : `${b}-${n + 1}`;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      flushParagraph();
      i++;
      continue;
    }

    // Fenced code
    const fence = line.match(FENCE);
    if (fence) {
      flushParagraph();
      const lang = fence[1] || null;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence (or EOF)
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Horizontal rule (checked before lists so "---" is never a list item)
    if (HR.test(line)) {
      flushParagraph();
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const h = line.match(HEADING);
    if (h) {
      flushParagraph();
      const level = h[1].length as 1 | 2 | 3 | 4;
      const children = parseInline(h[2]);
      const text = inlineToText(children);
      const id = uniqueId(slugifyHeading(text));
      blocks.push({ type: "heading", level, id, children });
      headings.push({ id, level, text });
      i++;
      continue;
    }

    // Blockquote (consecutive "> " lines form one quote)
    if (line.trimStart().startsWith(">")) {
      flushParagraph();
      const buf: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        buf.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        children: parseInline(buf.join(" ")),
      });
      continue;
    }

    // Table: a header row followed by a separator row
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      TABLE_SEP.test(lines[i + 1])
    ) {
      flushParagraph();
      const header = splitTableRow(line).map(parseInline);
      i += 2;
      const rows: InlineNode[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Lists (a continuation line indented under an item is appended to it)
    const ul = line.match(UL_ITEM);
    const ol = line.match(OL_ITEM);
    if (ul || ol) {
      flushParagraph();
      const ordered = !!ol;
      const items: string[] = [];
      while (i < lines.length) {
        const m = ordered ? lines[i].match(OL_ITEM) : lines[i].match(UL_ITEM);
        if (m) {
          items.push(m[1]);
          i++;
        } else if (
          items.length &&
          lines[i].trim() !== "" &&
          /^\s{2,}/.test(lines[i]) &&
          !HEADING.test(lines[i])
        ) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else break;
      }
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }

    paragraph.push(line.trim());
    i++;
  }
  flushParagraph();

  return { frontMatter, blocks, headings };
}
