import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  METRIC_DEFINITIONS,
  metricDefinition,
  metricKeys,
  metricPeriodLabel,
} from "./metricDefinitions";

describe("metric definitions", () => {
  it("defines every key exactly once", () => {
    const keys = metricKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(METRIC_DEFINITIONS[key].key).toBe(key);
    }
  });

  it("gives every metric a label, a definition and a source", () => {
    for (const def of Object.values(METRIC_DEFINITIONS)) {
      expect(def.label.trim().length).toBeGreaterThan(0);
      // A definition has to be a sentence, not a restatement of the label.
      expect(def.definition.length).toBeGreaterThan(40);
      expect(def.short.trim().length).toBeGreaterThan(0);
      expect(def.source.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps labels short enough to sit on a card", () => {
    for (const def of Object.values(METRIC_DEFINITIONS)) {
      expect(def.label.length).toBeLessThanOrEqual(32);
    }
  });

  it("uses one name per metric across the console", () => {
    const labels = Object.values(METRIC_DEFINITIONS).map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("says which period each figure covers", () => {
    expect(
      metricPeriodLabel(metricDefinition("users.new"), "Last 7 days"),
    ).toBe("Last 7 days");
    expect(
      metricPeriodLabel(
        metricDefinition("organizerMoney.booked"),
        "Last 7 days",
      ),
    ).toBe("All time");
    expect(
      metricPeriodLabel(
        metricDefinition("refunds.pendingCount"),
        "Last 7 days",
      ),
    ).toBe("Right now");
  });

  it("spells out the refund and gross rules that used to be wrong", () => {
    expect(metricDefinition("money.grossTicketSales").definition).toContain(
      "before any refund",
    );
    expect(metricDefinition("refunds.cashRefunded").definition).toContain(
      "service fee",
    );
    expect(metricDefinition("organizerMoney.deducted").definition).toContain(
      "requested",
    );
  });

  it("warns where a figure could mislead", () => {
    expect(metricDefinition("demo.platform").caveats?.length).toBeGreaterThan(
      0,
    );
    expect(
      metricDefinition("money.netPlatformRevenue").caveats?.length,
    ).toBeGreaterThan(0);
  });

  it("is fully documented in the operator glossary", () => {
    // docs/admin/metrics.md is generated from this registry
    // (npm run docs:metrics). Adding a metric without regenerating it would
    // leave an operator with a figure the handbook cannot explain.
    const glossary = readFileSync(
      fileURLToPath(
        new URL("../../../../docs/admin/metrics.md", import.meta.url),
      ),
      "utf8",
    );
    for (const key of metricKeys()) {
      expect(glossary, `${key} missing from docs/admin/metrics.md`).toContain(
        `### ${key}`,
      );
      expect(glossary).toContain(METRIC_DEFINITIONS[key].definition);
    }
  });

  it("throws on an unknown key rather than rendering a blank card", () => {
    // @ts-expect-error deliberately outside the union
    expect(() => metricDefinition("money.imaginary")).toThrow();
  });
});
