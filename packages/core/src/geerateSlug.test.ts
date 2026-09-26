import { describe, expect, it } from "vitest";
import { generateSlug } from "./geerateSlug";

describe("generateSlug", () => {
  it("keeps plain titles as before", () => {
    expect(generateSlug("Afrochella 2026: Day One")).toBe(
      "afrochella-2026-day-one",
    );
    expect(generateSlug("EV-2F9KQ")).toBe("ev-2f9kq");
  });

  it("folds Ghanaian letters instead of dropping them", () => {
    expect(generateSlug("Abɔnten Night")).toBe("abonten-night");
    expect(generateSlug("ABƆNTEN")).toBe("abonten");
    expect(generateSlug("Ɛkɔm Nkyɛn")).toBe("ekom-nkyen");
    expect(generateSlug("Ŋkɔ Ɖe Ʋɔ")).toBe("nko-de-vo");
  });

  it("drops accents instead of letters", () => {
    expect(generateSlug("Côte d'Ivoire Café")).toBe("cote-divoire-cafe");
  });
});
