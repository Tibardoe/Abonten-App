import type { CoreTranslator } from "../i18n/translator";
import { isDeletedAccount } from "../personName";

// How a review's author is shown, decided once for every review list that
// reads its author from user_info itself: the profile Reviews tabs (reviews
// of an organizer, reviews of the places someone owns), a place owner's and
// an organizer's review lists. review_list answers the same question for
// event and place pages (`reviewer_deleted`, parseReviewRow).
//
// A deleted account's review stays, but its scrubbed handle ("deleted_…")
// and picture never leave the read path: the row says `deleted`, and the
// screen shows "Former Abonten member" (core `member.former`, in the
// reader's language) with the default picture and no link to a profile.

/** The author columns a review list embeds from user_info. */
export type ReviewAuthorRow = {
  username?: string | null;
  avatar_public_id?: string | null;
  avatar_version?: string | null;
};

/** The author as every screen may show it. */
export type ReviewAuthorView = {
  username: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
  /** The account was deleted: no handle, no profile, the default picture. */
  deleted: boolean;
};

export function reviewAuthorView(
  author: ReviewAuthorRow | null | undefined,
): ReviewAuthorView | null {
  if (!author) return null;
  if (isDeletedAccount(author.username)) {
    return {
      username: null,
      avatar_public_id: null,
      avatar_version: null,
      deleted: true,
    };
  }
  return {
    username: author.username ?? null,
    avatar_public_id: author.avatar_public_id ?? null,
    avatar_version: author.avatar_version ?? null,
    deleted: false,
  };
}

/** Every row with its embedded author (under `key`) made safe to show. */
export function withReviewAuthors<
  K extends string,
  R extends { [P in K]?: ReviewAuthorRow | null },
>(rows: R[], key: K): (Omit<R, K> & { [P in K]: ReviewAuthorView | null })[] {
  return rows.map(
    (row) =>
      ({ ...row, [key]: reviewAuthorView(row[key]) }) as Omit<R, K> & {
        [P in K]: ReviewAuthorView | null;
      },
  );
}

/**
 * The name a review is shown under: "Former Abonten member" for a deleted
 * account, else the username, else `fallback` (the screen's own word for an
 * unnamed reviewer).
 */
export function reviewAuthorName(
  t: CoreTranslator,
  author: { username?: string | null; deleted?: boolean } | null | undefined,
  fallback: string,
): string {
  if (author?.deleted) return t("member.former");
  return author?.username || fallback;
}
