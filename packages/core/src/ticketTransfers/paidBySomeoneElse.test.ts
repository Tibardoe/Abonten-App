import { describe, expect, it } from "vitest";
import { isTicketPaidBySomeoneElse } from "./paidBySomeoneElse";

describe("isTicketPaidBySomeoneElse", () => {
  it("is true for a paid ticket held by someone it was sent to", () => {
    expect(
      isTicketPaidBySomeoneElse({
        user_id: "friend",
        transaction_id: "t1",
        issued_to: "buyer",
      }),
    ).toBe(true);
  });

  it("is false for the buyer's own ticket, also once it was sent back", () => {
    expect(
      isTicketPaidBySomeoneElse({
        user_id: "buyer",
        transaction_id: "t1",
        issued_to: "buyer",
      }),
    ).toBe(false);
  });

  it("is false for a free ticket, whoever holds it", () => {
    expect(
      isTicketPaidBySomeoneElse({
        user_id: "friend",
        transaction_id: null,
        issued_to: "buyer",
      }),
    ).toBe(false);
  });

  it("is false when the row does not say who it was issued to", () => {
    expect(
      isTicketPaidBySomeoneElse({ user_id: "friend", transaction_id: "t1" }),
    ).toBe(false);
  });
});
