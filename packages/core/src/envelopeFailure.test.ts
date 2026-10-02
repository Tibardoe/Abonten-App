import { describe, expect, it } from "vitest";
import {
  FailedReadError,
  answerOrThrow,
  failedReadOf,
  isTransientFailureStatus,
} from "./envelopeFailure";

describe("isTransientFailureStatus", () => {
  it("is true where the read did not get an answer", () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504]) {
      expect(isTransientFailureStatus(status)).toBe(true);
    }
  });

  it("is false for an answer, whatever it says", () => {
    for (const status of [200, 201, 204, 400, 401, 403, 404, 409, 410, 422]) {
      expect(isTransientFailureStatus(status)).toBe(false);
    }
  });
});

describe("failedReadOf", () => {
  it("finds the failure in an envelope", () => {
    expect(failedReadOf({ status: 500, message: "boom" })).toEqual({
      status: 500,
      message: "boom",
    });
    expect(failedReadOf({ status: 0 })).toEqual({ status: 0 });
  });

  it("leaves answers alone", () => {
    expect(failedReadOf({ status: 200, data: [] })).toBeNull();
    expect(failedReadOf({ status: 401, message: "Sign in" })).toBeNull();
    expect(failedReadOf({ status: 404 })).toBeNull();
  });

  it("leaves anything that is not an envelope alone", () => {
    expect(failedReadOf(null)).toBeNull();
    expect(failedReadOf(undefined)).toBeNull();
    expect(failedReadOf([])).toBeNull();
    expect(failedReadOf([{ status: 500 }])).toBeNull();
    expect(failedReadOf("500")).toBeNull();
    expect(failedReadOf(500)).toBeNull();
    // A page of a list, a row with a status that is a word.
    expect(failedReadOf({ data: [], nextCursor: null })).toBeNull();
    expect(failedReadOf({ status: "cancelled" })).toBeNull();
    expect(failedReadOf({ status: Number.NaN })).toBeNull();
  });
});

describe("answerOrThrow", () => {
  it("hands an answer back untouched", () => {
    const answer = { status: 200, data: [1, 2] };
    expect(answerOrThrow(answer)).toBe(answer);
    const page = { data: [], nextCursor: null, hasNextPage: false };
    expect(answerOrThrow(page)).toBe(page);
    expect(answerOrThrow(null)).toBeNull();
  });

  it("throws a failed read, keeping its status and message", () => {
    let caught: unknown;
    try {
      answerOrThrow({ status: 503, message: "Try again shortly." });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FailedReadError);
    expect((caught as FailedReadError).status).toBe(503);
    expect((caught as FailedReadError).message).toBe("Try again shortly.");
  });

  it("leaves the wording to the screen when the failure has none", () => {
    let caught: unknown;
    try {
      answerOrThrow({ status: 0 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FailedReadError);
    expect((caught as FailedReadError).message).toBe("");
  });
});
