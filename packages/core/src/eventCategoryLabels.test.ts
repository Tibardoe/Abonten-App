import { describe, expect, it } from "vitest";
import { eventCategoriesAndTypes } from "./eventCategoriesAndTypes";
import {
  isKnownEventCategorySlug,
  resolveEventCategoryLabel,
} from "./eventCategoryLabels";
import { generateSlug } from "./geerateSlug";

describe("resolveEventCategoryLabel", () => {
  // The defect this exists for: the slug round-trip dropped the "&", so the
  // similar-events query asked for a category no row has.
  it("restores the punctuation a slug drops", () => {
    expect(resolveEventCategoryLabel("music-concerts")).toBe(
      "Music & Concerts",
    );
    expect(resolveEventCategoryLabel("arts-culture-theatre")).toBe(
      "Arts, Culture & Theatre",
    );
    expect(resolveEventCategoryLabel("food-drink")).toBe("Food & Drink");
  });

  it("restores the casing a slug flattens", () => {
    expect(resolveEventCategoryLabel("dj-parties")).toBe("DJ Parties");
    expect(resolveEventCategoryLabel("ai-ml-conferences")).toBe(
      "AI & ML Conferences",
    );
    expect(resolveEventCategoryLabel("stem-events")).toBe("STEM Events");
  });

  it("round-trips every category the app ships", () => {
    for (const group of eventCategoriesAndTypes) {
      expect(resolveEventCategoryLabel(generateSlug(group.category))).toBe(
        group.category,
      );
    }
  });

  it("round-trips every event type whose slug is unambiguous", () => {
    const seen = new Map<string, string>();
    for (const group of eventCategoriesAndTypes) {
      for (const type of group.types) {
        const slug = generateSlug(type);
        if (!seen.has(slug)) seen.set(slug, type);
      }
    }
    for (const [slug, type] of seen) {
      // A type sharing a slug with a category resolves to the category on
      // purpose — that is the column the similar-events query filters on.
      if (
        isKnownEventCategorySlug(slug) &&
        resolveEventCategoryLabel(slug) !== type
      ) {
        expect(
          eventCategoriesAndTypes.some(
            (g) => g.category === resolveEventCategoryLabel(slug),
          ),
        ).toBe(true);
        continue;
      }
      expect(resolveEventCategoryLabel(slug)).toBe(type);
    }
  });

  it("falls back to a plain de-slug for anything it does not know", () => {
    expect(resolveEventCategoryLabel("east-legon")).toBe("East Legon");
    expect(resolveEventCategoryLabel("some-random-search")).toBe(
      "Some Random Search",
    );
  });

  it("tolerates a label passed where a slug was expected", () => {
    expect(resolveEventCategoryLabel("Music & Concerts")).toBe(
      "Music & Concerts",
    );
  });

  it("does not claim to know an arbitrary slug", () => {
    expect(isKnownEventCategorySlug("music-concerts")).toBe(true);
    expect(isKnownEventCategorySlug("east-legon")).toBe(false);
    expect(isKnownEventCategorySlug("")).toBe(false);
  });
});
