import { describe, expect, it } from "vitest";
import {
  inlineToText,
  parseFrontMatter,
  parseInline,
  parseMarkdown,
  slugifyHeading,
} from "./parseMarkdown";

describe("parseFrontMatter", () => {
  it("reads key: value pairs and returns the body", () => {
    const { frontMatter, body } = parseFrontMatter(
      '---\ntitle: "Privacy Policy"\nversion: 1.0-draft\nstatus: Review required\n---\n# Hello\n',
    );
    expect(frontMatter).toEqual({
      title: "Privacy Policy",
      version: "1.0-draft",
      status: "Review required",
    });
    expect(body.trim()).toBe("# Hello");
  });

  it("returns an empty object when there is no front matter", () => {
    expect(parseFrontMatter("# Hi").frontMatter).toEqual({});
  });

  it("treats an unterminated block as body text", () => {
    const r = parseFrontMatter("---\ntitle: x\n# Hi");
    expect(r.frontMatter).toEqual({});
    expect(r.body).toContain("title: x");
  });
});

describe("parseInline", () => {
  it("parses bold, italic, code and links", () => {
    const nodes = parseInline(
      "Pay **on time**, see *terms*, run `npm test`, or [help](/help).",
    );
    expect(nodes).toEqual([
      { type: "text", text: "Pay " },
      { type: "strong", children: [{ type: "text", text: "on time" }] },
      { type: "text", text: ", see " },
      { type: "em", children: [{ type: "text", text: "terms" }] },
      { type: "text", text: ", run " },
      { type: "code", text: "npm test" },
      { type: "text", text: ", or " },
      {
        type: "link",
        href: "/help",
        children: [{ type: "text", text: "help" }],
      },
      { type: "text", text: "." },
    ]);
  });

  it("leaves snake_case identifiers alone", () => {
    expect(parseInline("a user_info b ticket_type c")).toEqual([
      { type: "text", text: "a user_info b ticket_type c" },
    ]);
  });

  it("honours backslash escapes and unmatched markers", () => {
    expect(parseInline("5 \\* 3 and a lone * star")).toEqual([
      { type: "text", text: "5 * 3 and a lone * star" },
    ]);
  });

  it("nests formatting inside links", () => {
    const [link] = parseInline("[**Terms**](/legal/terms)");
    expect(link.type).toBe("link");
    if (link.type === "link") {
      expect(link.href).toBe("/legal/terms");
      expect(link.children[0].type).toBe("strong");
    }
  });
});

describe("parseMarkdown", () => {
  it("builds headings with unique ids and a TOC", () => {
    const doc = parseMarkdown(
      "# Title\n\n## Data we collect\n\n## Data we collect\n",
    );
    expect(doc.headings).toEqual([
      { id: "title", level: 1, text: "Title" },
      { id: "data-we-collect", level: 2, text: "Data we collect" },
      { id: "data-we-collect-2", level: 2, text: "Data we collect" },
    ]);
  });

  it("joins paragraph lines and separates on blank lines", () => {
    const doc = parseMarkdown("line one\nline two\n\nnext para");
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", text: "line one line two" }],
    });
  });

  it("parses ordered and unordered lists with continuation lines", () => {
    const doc = parseMarkdown(
      "- one\n- two\n  continues\n\n1. first\n2. second\n",
    );
    expect(doc.blocks[0]).toMatchObject({
      type: "list",
      ordered: false,
      items: [
        [{ type: "text", text: "one" }],
        [{ type: "text", text: "two continues" }],
      ],
    });
    expect(doc.blocks[1]).toMatchObject({ type: "list", ordered: true });
  });

  it("parses tables", () => {
    const doc = parseMarkdown(
      "| Cookie | Purpose |\n|---|---|\n| `abn_ref` | referral \\| invite |\n",
    );
    const table = doc.blocks[0];
    expect(table.type).toBe("table");
    if (table.type === "table") {
      expect(inlineToText(table.header[0])).toBe("Cookie");
      expect(table.rows[0][0]).toEqual([{ type: "code", text: "abn_ref" }]);
      expect(inlineToText(table.rows[0][1])).toBe("referral | invite");
    }
  });

  it("parses blockquotes, rules and fenced code", () => {
    const doc = parseMarkdown(
      "> note\n> more\n\n---\n\n```bash\nnpm run x\n```\n",
    );
    expect(doc.blocks[0]).toEqual({
      type: "blockquote",
      children: [{ type: "text", text: "note more" }],
    });
    expect(doc.blocks[1]).toEqual({ type: "hr" });
    expect(doc.blocks[2]).toEqual({
      type: "code",
      lang: "bash",
      text: "npm run x",
    });
  });

  it("does not treat a rule as a list item", () => {
    expect(parseMarkdown("---\n").blocks).toEqual([{ type: "hr" }]);
  });
});

describe("slugifyHeading", () => {
  it("produces stable url-safe ids", () => {
    expect(slugifyHeading("3. Refunds & cancellations (Ghana)")).toBe(
      "3-refunds-cancellations-ghana",
    );
  });
});
