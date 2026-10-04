import { describe, expect, it } from "vitest";
import { t, tFr } from "./i18n/testTranslator";
import { isDeletedAccount, personHandle, personName } from "./personName";

describe("personName", () => {
  it("names a person by their name, then their username", () => {
    expect(personName(t, { full_name: "Ama Mensah", username: "ama" })).toBe(
      "Ama Mensah",
    );
    expect(personName(t, { full_name: "", username: "ama" })).toBe("ama");
    expect(personName(t, { full_name: null, username: null })).toBeNull();
    expect(personName(t, null)).toBeNull();
  });

  it("shows a deleted account as a former member, in the reader's language", () => {
    const deleted = {
      full_name: "Deleted user",
      username: "deleted_3fa85f645717",
    };
    expect(isDeletedAccount(deleted.username)).toBe(true);
    expect(personName(t, deleted)).toBe("Former Abonten member");
    expect(personName(tFr, deleted)).not.toBe("Former Abonten member");
    expect(personName(tFr, deleted)).not.toContain("Deleted");
    expect(personHandle(deleted)).toBeNull();
  });

  it("does not mistake an ordinary username for a deleted account", () => {
    for (const username of [
      "deleted",
      "deleted_",
      "deleted_me",
      "undeleted_3fa85f645717",
    ]) {
      expect(isDeletedAccount(username)).toBe(false);
    }
    expect(personHandle({ username: "kofi_events" })).toBe("kofi_events");
  });
});
