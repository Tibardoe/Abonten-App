import { describe, expect, it } from "vitest";
import {
  availableCampaignActions,
  campaignCapabilities,
  campaignSlug,
  isLiveCampaignStatus,
  nextCampaignStatus,
} from "./campaignLifecycle";

describe("nextCampaignStatus", () => {
  it("follows the happy path draft → active → winding_down → completed → archived", () => {
    expect(nextCampaignStatus("draft", "activate")).toBe("active");
    expect(nextCampaignStatus("active", "wind_down")).toBe("winding_down");
    expect(nextCampaignStatus("winding_down", "complete")).toBe("completed");
    expect(nextCampaignStatus("completed", "archive")).toBe("archived");
  });

  it("pauses and resumes", () => {
    expect(nextCampaignStatus("active", "pause")).toBe("paused");
    expect(nextCampaignStatus("paused", "resume")).toBe("active");
    expect(nextCampaignStatus("paused", "wind_down")).toBe("winding_down");
    expect(nextCampaignStatus("paused", "complete")).toBe("completed");
  });

  it("lets a plan that never ran be archived", () => {
    expect(nextCampaignStatus("draft", "archive")).toBe("archived");
  });

  it("refuses moves that skip states or go backwards", () => {
    expect(nextCampaignStatus("draft", "complete")).toBeNull();
    expect(nextCampaignStatus("draft", "pause")).toBeNull();
    expect(nextCampaignStatus("active", "complete")).toBeNull();
    expect(nextCampaignStatus("active", "archive")).toBeNull();
    expect(nextCampaignStatus("winding_down", "resume")).toBeNull();
    expect(nextCampaignStatus("completed", "resume")).toBeNull();
    expect(nextCampaignStatus("archived", "activate")).toBeNull();
    expect(nextCampaignStatus("archived", "archive")).toBeNull();
  });
});

describe("availableCampaignActions", () => {
  it("lists exactly the allowed actions per state", () => {
    expect(availableCampaignActions("draft")).toEqual(["activate", "archive"]);
    expect(availableCampaignActions("active")).toEqual(["pause", "wind_down"]);
    expect(availableCampaignActions("paused")).toEqual([
      "resume",
      "wind_down",
      "complete",
    ]);
    expect(availableCampaignActions("winding_down")).toEqual(["complete"]);
    expect(availableCampaignActions("completed")).toEqual(["archive"]);
    expect(availableCampaignActions("archived")).toEqual([]);
  });
});

describe("campaignCapabilities", () => {
  it("stops new work but keeps reviews and payouts while paused", () => {
    const paused = campaignCapabilities("paused");
    expect(paused.newAssignments).toBe(false);
    expect(paused.newSubmissions).toBe(false);
    expect(paused.reviews).toBe(true);
    expect(paused.commissionGeneration).toBe(false);
    expect(paused.payouts).toBe(true);
  });

  it("allows one resubmission but no new submissions while winding down", () => {
    const wd = campaignCapabilities("winding_down");
    expect(wd.newSubmissions).toBe(false);
    expect(wd.resubmissions).toBe(true);
    expect(wd.commissionGeneration).toBe(true);
  });

  it("is read-only once archived", () => {
    const archived = campaignCapabilities("archived");
    expect(Object.entries(archived).filter(([k]) => k !== "workerUi")).toEqual(
      expect.arrayContaining([
        ["newAssignments", false],
        ["newSubmissions", false],
        ["reviews", false],
        ["commissionGeneration", false],
        ["payouts", false],
      ]),
    );
  });
});

describe("isLiveCampaignStatus", () => {
  it("treats active, paused and winding_down as live", () => {
    expect(isLiveCampaignStatus("active")).toBe(true);
    expect(isLiveCampaignStatus("paused")).toBe(true);
    expect(isLiveCampaignStatus("winding_down")).toBe(true);
    expect(isLiveCampaignStatus("draft")).toBe(false);
    expect(isLiveCampaignStatus("completed")).toBe(false);
    expect(isLiveCampaignStatus("archived")).toBe(false);
  });
});

describe("campaignSlug", () => {
  it("makes a url-safe slug", () => {
    expect(campaignSlug("Ashanti 2026 Q4")).toBe("ashanti-2026-q4");
    expect(campaignSlug("  Greater Accra — pilot!! ")).toBe(
      "greater-accra-pilot",
    );
    expect(campaignSlug("Kumasi (Ejisu & Konongo)")).toBe(
      "kumasi-ejisu-konongo",
    );
  });
});
