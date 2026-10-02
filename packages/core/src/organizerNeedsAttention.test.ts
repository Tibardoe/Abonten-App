import { describe, expect, it } from "vitest";
import { t as en, tFr as fr } from "./i18n/testTranslator";
import { organizerNeedsAttentionText } from "./organizerNeedsAttention";

// French puts a narrow no-break space before a colon: fold every kind of
// space to a plain one before comparing.
const plain = (text: string) => text.replace(/\p{Zs}/gu, " ");

const base = {
  message: "Starts Oct 06 with no sales yet.",
  starts_at: "2026-10-06T18:00:00.000Z",
  timezone: "Africa/Accra",
  sold: 0,
  remaining: null as unknown as number,
  ticket_type: null as unknown as string,
};

describe("organizerNeedsAttentionText", () => {
  it("words an event that has sold nothing", () => {
    const row = { ...base, rule_type: "no_sales_yet" };
    expect(organizerNeedsAttentionText(en, row, "en")).toBe(
      "Starts 6 Oct with no sales yet.",
    );
    expect(plain(organizerNeedsAttentionText(fr, row, "fr"))).toBe(
      "Commence le 6 oct., sans aucune vente pour l'instant.",
    );
  });

  it("counts the tickets the way the language does", () => {
    const row = { ...base, rule_type: "low_registrations" };
    expect(organizerNeedsAttentionText(en, { ...row, sold: 1 }, "en")).toBe(
      "Starts 6 Oct with only 1 ticket sold so far.",
    );
    expect(organizerNeedsAttentionText(en, { ...row, sold: 3 }, "en")).toBe(
      "Starts 6 Oct with only 3 tickets sold so far.",
    );
    expect(
      plain(organizerNeedsAttentionText(fr, { ...row, sold: 1 }, "fr")),
    ).toBe("Commence le 6 oct. avec seulement 1 billet vendu pour l'instant.");
  });

  it("names the tier that is running out, and words a system tier", () => {
    const row = {
      ...base,
      rule_type: "nearly_sold_out",
      starts_at: null as unknown as string,
      remaining: 2,
    };
    expect(
      organizerNeedsAttentionText(en, { ...row, ticket_type: "VIP" }, "en"),
    ).toBe("VIP: almost sold out (2 tickets left).");
    expect(
      plain(
        organizerNeedsAttentionText(
          fr,
          { ...row, ticket_type: "SINGLE TICKET", remaining: 1 },
          "fr",
        ),
      ),
    ).toBe("Billet standard : presque complet (1 billet restant).");
  });

  it("shows the day in the event's own zone", () => {
    // 23:30 UTC on the 6th is already the 7th in Nairobi.
    const row = {
      ...base,
      rule_type: "no_sales_yet",
      starts_at: "2026-10-06T23:30:00.000Z",
      timezone: "Africa/Nairobi",
    };
    expect(organizerNeedsAttentionText(en, row, "en")).toBe(
      "Starts 7 Oct with no sales yet.",
    );
  });

  it("prints the database's own sentence when the facts are not there", () => {
    // A database that has not had the migration yet, or a rule added later.
    expect(
      organizerNeedsAttentionText(
        fr,
        {
          rule_type: "no_sales_yet",
          message: "Starts Oct 06 with no sales yet.",
        },
        "fr",
      ),
    ).toBe("Starts Oct 06 with no sales yet.");
    expect(
      organizerNeedsAttentionText(
        en,
        {
          ...base,
          rule_type: "a_rule_from_the_future",
          message: "Something new.",
        },
        "en",
      ),
    ).toBe("Something new.");
  });
});
