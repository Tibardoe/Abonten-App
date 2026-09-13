import { describe, expect, it } from "vitest";
import { isOptionalNotificationType, notificationCategory } from "./categories";

describe("notificationCategory", () => {
  it("keeps money, tickets and safety notices transactional", () => {
    for (const type of [
      "ticket_confirmed",
      "event_cancelled",
      "refund_completed",
      "refund_failed",
      "verification_approved",
      "place_claim_rejected",
      "fieldops_commission_paid",
      "promotion_started",
      "announcement",
      "something_new_and_unknown",
    ]) {
      expect(notificationCategory(type)).toBe("transactional");
      expect(isOptionalNotificationType(type)).toBe(false);
    }
  });

  it("classifies messages, reviews and booking updates as social", () => {
    for (const type of [
      "message",
      "review_received",
      "review_reply",
      "place_booking_confirmed",
      "place_booking_declined",
    ]) {
      expect(notificationCategory(type)).toBe("social");
    }
  });

  it("recognises rewards and recommendations", () => {
    expect(notificationCategory("welcome_credit")).toBe("rewards");
    expect(notificationCategory("recommendation_digest")).toBe(
      "recommendations",
    );
  });
});
