import { describe, expect, it } from "vitest";
import {
  accountSetupPromptMessage,
  accountSetupPromptVisible,
  accountSetupQuietDays,
} from "./accountSetupPrompt";
import {
  type ProfileCompletionInput,
  computeProfileCompletion,
  leadingIncompleteItem,
} from "./profileCompletion";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-23T12:00:00Z");

const complete: ProfileCompletionInput = {
  fullName: "Ama Mensah",
  usernameIsGenerated: false,
  avatarPublicId: "avatars/ama",
  email: "ama@example.com",
  emailConfirmedAt: "2026-01-01T00:00:00Z",
  phone: "233201234567",
  phoneConfirmedAt: "2026-01-01T00:00:00Z",
};

describe("computeProfileCompletion", () => {
  it("is complete only with all five steps", () => {
    const c = computeProfileCompletion(complete);
    expect(c.total).toBe(5);
    expect(c.isComplete).toBe(true);
  });

  it("a Google account without a phone is missing only the phone", () => {
    const c = computeProfileCompletion({ ...complete, phone: null });
    expect(c.completedCount).toBe(4);
    expect(c.items.find((i) => i.key === "phone")?.state).toBe("missing");
    expect(leadingIncompleteItem(c)?.key).toBe("phone");
  });

  it("a phone sign-up without an email leads with the email", () => {
    const c = computeProfileCompletion({
      ...complete,
      email: null,
      emailConfirmedAt: null,
      fullName: null,
      usernameIsGenerated: true,
      avatarPublicId: null,
    });
    expect(c.completedCount).toBe(1);
    expect(leadingIncompleteItem(c)?.key).toBe("email");
    expect(c.items.find((i) => i.key === "email")?.label).toBe(
      "Add your email",
    );
  });

  it("an unconfirmed email or phone is 'unverified', never done", () => {
    const c = computeProfileCompletion({
      ...complete,
      emailConfirmedAt: null,
      phoneConfirmedAt: null,
    });
    const email = c.items.find((i) => i.key === "email");
    const phone = c.items.find((i) => i.key === "phone");
    expect(email).toMatchObject({ state: "unverified", complete: false });
    expect(email?.label).toBe("Verify your email");
    expect(phone).toMatchObject({ state: "unverified", complete: false });
  });

  it("a pending email change keeps the verified address usable", () => {
    const c = computeProfileCompletion({
      ...complete,
      pendingEmail: "new@example.com",
    });
    expect(c.items.find((i) => i.key === "email")?.complete).toBe(true);
  });

  it("a generated username or blank name doesn't count", () => {
    const c = computeProfileCompletion({
      ...complete,
      fullName: "   ",
      usernameIsGenerated: null,
    });
    expect(c.items.find((i) => i.key === "name")?.complete).toBe(false);
    expect(c.items.find((i) => i.key === "username")?.complete).toBe(false);
  });
});

describe("accountSetupPromptVisible", () => {
  const incomplete = computeProfileCompletion({ ...complete, phone: null });

  it("never shows once everything is done", () => {
    expect(
      accountSetupPromptVisible(computeProfileCompletion(complete), null, NOW),
    ).toBe(false);
  });

  it("shows until first dismissed", () => {
    expect(accountSetupPromptVisible(incomplete, null, NOW)).toBe(true);
    expect(
      accountSetupPromptVisible(
        incomplete,
        { dismissCount: 0, dismissedAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("stays away longer after each dismissal: 7, 30, then 90 days", () => {
    expect(accountSetupQuietDays(1)).toBe(7);
    expect(accountSetupQuietDays(2)).toBe(30);
    expect(accountSetupQuietDays(3)).toBe(90);
    expect(accountSetupQuietDays(12)).toBe(90);

    const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
    expect(
      accountSetupPromptVisible(
        incomplete,
        { dismissCount: 1, dismissedAt: at(6) },
        NOW,
      ),
    ).toBe(false);
    expect(
      accountSetupPromptVisible(
        incomplete,
        { dismissCount: 1, dismissedAt: at(7) },
        NOW,
      ),
    ).toBe(true);
    expect(
      accountSetupPromptVisible(
        incomplete,
        { dismissCount: 2, dismissedAt: at(29) },
        NOW,
      ),
    ).toBe(false);
    expect(
      accountSetupPromptVisible(
        incomplete,
        { dismissCount: 3, dismissedAt: at(89) },
        NOW,
      ),
    ).toBe(false);
    expect(
      accountSetupPromptVisible(
        incomplete,
        { dismissCount: 3, dismissedAt: at(90) },
        NOW,
      ),
    ).toBe(true);
  });

  it("leads the message with the step that matters most", () => {
    expect(accountSetupPromptMessage(incomplete).body).toMatch(/phone/);
    const noEmail = computeProfileCompletion({
      ...complete,
      email: null,
      emailConfirmedAt: null,
    });
    expect(accountSetupPromptMessage(noEmail).body).toMatch(/email/);
  });
});
