import { describe, expect, it } from "vitest";
import { t, tFr } from "../i18n/testTranslator";
import {
  reviewAuthorName,
  reviewAuthorView,
  withReviewAuthors,
} from "./reviewAuthor";

const deleted = {
  username: "deleted_3fa85f645717",
  avatar_public_id: null,
  avatar_version: null,
};

describe("reviewAuthorView", () => {
  it("keeps an ordinary author as it is", () => {
    expect(
      reviewAuthorView({
        username: "ama",
        avatar_public_id: "user_profiles/a/b",
        avatar_version: "3",
      }),
    ).toEqual({
      username: "ama",
      avatar_public_id: "user_profiles/a/b",
      avatar_version: "3",
      deleted: false,
    });
  });

  it("never passes on a deleted account's handle or picture", () => {
    const view = reviewAuthorView({
      ...deleted,
      avatar_public_id: "left/behind",
      avatar_version: "1",
    });
    expect(view).toEqual({
      username: null,
      avatar_public_id: null,
      avatar_version: null,
      deleted: true,
    });
    expect(JSON.stringify(view)).not.toContain("deleted_");
  });

  it("answers null for a missing author", () => {
    expect(reviewAuthorView(null)).toBeNull();
    expect(reviewAuthorView(undefined)).toBeNull();
  });

  it("fills in the defaults a narrower select leaves out", () => {
    expect(reviewAuthorView({ username: "kofi" })).toEqual({
      username: "kofi",
      avatar_public_id: null,
      avatar_version: null,
      deleted: false,
    });
  });
});

describe("withReviewAuthors", () => {
  it("maps the embedded author of every row and keeps the rest", () => {
    const rows = withReviewAuthors(
      [
        { id: "1", rating: 5, user_info: { username: "ama" } },
        { id: "2", rating: 1, user_info: deleted },
        { id: "3", rating: 3, user_info: null },
      ],
      "user_info",
    );
    expect(rows.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(rows[0].user_info?.username).toBe("ama");
    expect(rows[1].user_info).toMatchObject({ username: null, deleted: true });
    expect(rows[2].user_info).toBeNull();
    expect(JSON.stringify(rows)).not.toContain("deleted_");
  });
});

describe("reviewAuthorName", () => {
  it("names a deleted author as a former member, in the reader's language", () => {
    const view = reviewAuthorView(deleted);
    expect(reviewAuthorName(t, view, "Someone")).toBe("Former Abonten member");
    expect(reviewAuthorName(tFr, view, "Quelqu'un")).toBe(tFr("member.former"));
    expect(reviewAuthorName(tFr, view, "Quelqu'un")).not.toContain("deleted");
  });

  it("uses the username, else the screen's fallback", () => {
    expect(
      reviewAuthorName(t, reviewAuthorView({ username: "ama" }), "x"),
    ).toBe("ama");
    expect(reviewAuthorName(t, reviewAuthorView({ username: null }), "x")).toBe(
      "x",
    );
    expect(reviewAuthorName(t, null, "Someone")).toBe("Someone");
  });
});
