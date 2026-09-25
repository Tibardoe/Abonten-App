import { describe, expect, it } from "vitest";
import { GENERIC_ERROR_MESSAGE, userFacingError } from "./userFacingError";

describe("userFacingError", () => {
  it("hides Postgres's own wording", () => {
    for (const message of [
      'duplicate key value violates unique constraint "ticket_ticket_code_key"',
      'new row violates row-level security policy for table "event"',
      "permission denied for table attendance",
      'invalid input syntax for type uuid: "x"',
      'column "foo" does not exist',
    ]) {
      expect(userFacingError("ctx", { message })).toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  it("passes through a message an Abonten function raised for people", () => {
    expect(
      userFacingError("ctx", {
        message: "You can only review this event after it has ended.",
        code: "23514",
      }),
    ).toBe("You can only review this event after it has ended.");
  });

  it("falls back when there is no message", () => {
    expect(userFacingError("ctx", null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
