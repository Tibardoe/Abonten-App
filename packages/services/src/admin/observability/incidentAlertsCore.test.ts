import { describe, expect, it } from "vitest";
import { incidentAlertText } from "./incidentAlertsCore";

const incident = {
  id: "1",
  title: 'Health check "weekly" is down',
  severity: "high",
  component: "health.weekly",
  summary: "The weekly check failed 3 runs in a row.",
  started_at: "2026-09-26T18:40:00Z",
};

describe("incidentAlertText", () => {
  it("names a single incident in the subject", () => {
    const { subject, text } = incidentAlertText([incident]);
    expect(subject).toBe('[Abonten high] Health check "weekly" is down');
    expect(text).toContain("health.weekly");
    expect(text).toContain("https://admin.abontenhub.com/monitoring");
  });

  it("counts several incidents in the subject and lists each", () => {
    const { subject, text } = incidentAlertText([
      incident,
      {
        ...incident,
        id: "2",
        title: "Monthly rebates: some events failed",
        component: null,
      },
    ]);
    expect(subject).toBe("[Abonten] 2 new incidents");
    expect(text).toContain("Monthly rebates: some events failed (high)");
  });
});
