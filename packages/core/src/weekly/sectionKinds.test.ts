import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEEKLY_EDITION_STATUS_LABEL, weeklyEditionPath } from "./copy";
import { WEEKLY_SECTION_ICON_KEYS, weeklySectionIcon } from "./sectionIcons";
import {
  WEEKLY_DEFAULT_TEMPLATE,
  WEEKLY_LAYOUTS,
  WEEKLY_SECTION_KINDS,
  WEEKLY_SECTION_KIND_KEYS,
  sectionAccepts,
  weeklySectionKind,
} from "./sectionKinds";

const MIGRATION = readFileSync(
  join(
    __dirname,
    "../../../../supabase/migrations/20260913120000_weekly_core.sql",
  ),
  "utf8",
);

function sqlCheckList(column: string, mustInclude?: string): string[] {
  const pattern = new RegExp(
    String.raw`${column}\s+text[^\n]*\n?\s*check \(${column} in \(([^)]*)\)`,
    "g",
  );
  for (const match of MIGRATION.matchAll(pattern)) {
    const values = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    if (!mustInclude || values.includes(mustInclude)) return values;
  }
  throw new Error(`No CHECK list found for ${column}`);
}

describe("section kind registry", () => {
  it("matches the database CHECK constraint exactly", () => {
    expect([...WEEKLY_SECTION_KIND_KEYS].sort()).toEqual(
      sqlCheckList("kind").sort(),
    );
  });

  it("matches the layout CHECK constraint exactly", () => {
    expect([...WEEKLY_LAYOUTS].sort()).toEqual(sqlCheckList("layout").sort());
  });

  it("gives every kind a usable default", () => {
    for (const def of WEEKLY_SECTION_KINDS) {
      expect(def.defaultTitle.length).toBeGreaterThan(0);
      expect(def.defaultTitle.length).toBeLessThanOrEqual(80);
      expect(WEEKLY_LAYOUTS).toContain(def.defaultLayout);
      if (def.defaultIconKey) {
        expect(weeklySectionIcon(def.defaultIconKey)).not.toBeNull();
      }
    }
  });

  it("has no duplicate kinds and a template of editorial kinds", () => {
    expect(new Set(WEEKLY_SECTION_KIND_KEYS).size).toBe(
      WEEKLY_SECTION_KIND_KEYS.length,
    );
    for (const kind of WEEKLY_DEFAULT_TEMPLATE) {
      expect(weeklySectionKind(kind)?.editorial).toBe(true);
    }
    expect(weeklySectionKind("nope")).toBeUndefined();
  });

  it("only lets matching listings into scoped sections", () => {
    expect(sectionAccepts("mixed", "event")).toBe(true);
    expect(sectionAccepts("events", "event")).toBe(true);
    expect(sectionAccepts("events", "place")).toBe(false);
    expect(sectionAccepts("places", "place")).toBe(true);
  });
});

describe("icons and copy", () => {
  it("uses keys the database accepts", () => {
    for (const key of WEEKLY_SECTION_ICON_KEYS) {
      expect(key).toMatch(/^[a-z_]{1,32}$/);
    }
    expect(weeklySectionIcon("unknown")).toBeNull();
    expect(weeklySectionIcon(null)).toBeNull();
  });

  it("labels every status and builds encoded paths", () => {
    expect(Object.keys(WEEKLY_EDITION_STATUS_LABEL).sort()).toEqual(
      sqlCheckList("status", "draft").sort(),
    );
    expect(weeklyEditionPath("accra", "2026-09-14")).toBe(
      "/weekly/accra/2026-09-14",
    );
  });
});
