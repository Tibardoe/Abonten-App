import { foldSearchText } from "@abonten/core/search/foldSearchText";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type SearchFixtures,
  createSearchFixtures,
  eventIdsFor,
  nextInMonth,
  placeIdsFor,
} from "./searchFixtures";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Search in the reader's language (migration 20261002140000), against a
// real local stack: accents and Twi letters fold away, dates are read in
// French, Spanish, German and Portuguese, everyday words of those languages
// reach listings written in English and the other way round, and the typo
// fallback of a dated search keeps the dates.

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);

// Short, like the relevance suite's: a long shared token would be most of
// a query and of a title, and the typo fallback compares the two whole.
const TOKEN = `zl${Date.now().toString(36).slice(-4)}`;

let organizer: TestUser;
let fixtures: SearchFixtures;
const conceptTerms: string[] = [];

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

/** Noon in Accra on the day after today. */
function tomorrowNoon(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12),
  );
}

beforeAll(async () => {
  organizer = await createTestUser(getServiceClient());
  await svc
    .from("user_info")
    .update({ username: `${TOKEN}_org`, full_name: `Désiré ${TOKEN}son` })
    .eq("id", organizer.id);
  fixtures = createSearchFixtures(svc, () => organizer.id);
});

afterAll(async () => {
  await fixtures.cleanup();
  if (conceptTerms.length) {
    await svc
      .from("search_concept" as never)
      .delete()
      .in("term", conceptTerms);
  }
  if (organizer) await deleteTestUser(getServiceClient(), organizer.id);
});

describe("the same letters", () => {
  it("folds the way the app does", async () => {
    // The database is the authority; the TypeScript copy drives the forms.
    const samples = [
      "Café Kwae",
      "SOIRÉE À la Plage",
      "Ɔdehyeɛ kɔkɔɔ",
      "ABƆNTEN",
      "Straße Müller",
      "Œuvre Æther Søren Łódź",
      `cafe${String.fromCodePoint(0x301)}`,
      "Esi’s “Jam” – Live",
      "São João, mañana",
      "ŋma Ɖɔ Ƒe ʋu Ɣe",
      "gob3 & R&B 100%",
    ];
    for (const sample of samples) {
      const { data, error } = await svc.rpc(
        "_search_fold" as never,
        { p_text: sample } as never,
      );
      expect(error).toBeNull();
      expect(data, sample).toBe(foldSearchText(sample));
    }
    expect(foldSearchText("Ɔdehyeɛ Café")).toBe("odehyee cafe");
  });

  it("finds an accented description with plain letters, and the other way round", async () => {
    // Only the description says it, so neither the title's typo fallback
    // nor a shared plain word can find it: the words have to fold.
    const accented = await fixtures.makeEvent({
      title: `Sunset Session ${crypto.randomUUID().slice(0, 6)}`,
      description: `Rendez-vous au Café ${TOKEN}té pour une soirée Ɔdehyeɛ inoubliable sur la plage.`,
      startsAt: inDays(4),
    });
    expect(await eventIdsFor(anon, `cafe ${TOKEN}te soiree`)).toContain(
      accented,
    );
    expect(await eventIdsFor(anon, `odehyee ${TOKEN}te`)).toContain(accented);

    const plain = await fixtures.makeEvent({
      title: `Harbour Session ${crypto.randomUUID().slice(0, 6)}`,
      description: `Meet at Cafe ${TOKEN}ta for a soiree by the water, all evening long.`,
      startsAt: inDays(4),
    });
    expect(await eventIdsFor(anon, `café ${TOKEN}tà soirée`)).toContain(plain);
  });

  it("gives an accented name the same exact-name boost", async () => {
    const exact = await fixtures.makePlace(
      `Café ${TOKEN}`,
      "Coffee and pastries all day.",
    );
    const longer = await fixtures.makePlace(
      `${TOKEN} Cafe Corner And Garden`,
      "Coffee and pastries all day.",
    );
    const ids = await placeIdsFor(anon, `cafe ${TOKEN}`);
    expect(ids).toContain(exact);
    expect(ids).toContain(longer);
    expect(ids.indexOf(exact)).toBeLessThan(ids.indexOf(longer));
  });

  it("reads a curly apostrophe as a plain one", async () => {
    const spot = await fixtures.makePlace(
      `${TOKEN} Auntie Esi’s`,
      "Waakye from six in the morning.",
    );
    const other = await fixtures.makePlace(
      `${TOKEN} Auntie Esi Sister Kitchen`,
      "Waakye from six in the morning.",
    );
    const ids = await placeIdsFor(anon, `${TOKEN} auntie esi's`);
    expect(ids).toContain(spot);
    if (ids.includes(other)) {
      expect(ids.indexOf(spot)).toBeLessThan(ids.indexOf(other));
    }
  });

  it("finds an organizer whose name has accents", async () => {
    await fixtures.makeEvent({
      title: `${TOKEN} Organizer Night`,
      startsAt: inDays(5),
    });
    const { data, error } = await anon.rpc("search_organizers", {
      p_query: `desire ${TOKEN}son`,
    });
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.id)).toContain(organizer.id);
  });

  it("finds it in the type-ahead too", async () => {
    const event = await fixtures.makeEvent({
      title: `${TOKEN}fête Été`,
      startsAt: inDays(6),
    });
    const { data, error } = await anon.rpc("search_suggest", {
      p_query: `${TOKEN}fete ete`,
    });
    expect(error).toBeNull();
    const first = (data ?? []).find((r) => r.entity_type === "event");
    expect(first?.id).toBe(event);
  });
});

describe("dates in the reader's language", () => {
  let december: string;
  let june: string;
  let tomorrow: string;
  let later: string;

  beforeAll(async () => {
    december = await fixtures.makeEvent({
      title: `${TOKEN} Harmattan Jazz`,
      startsAt: nextInMonth(12),
    });
    june = await fixtures.makeEvent({
      title: `${TOKEN} Rainy Season Jazz`,
      startsAt: nextInMonth(6),
    });
    tomorrow = await fixtures.makeEvent({
      title: `${TOKEN} Lunch Hour Jazz`,
      startsAt: tomorrowNoon(),
    });
    later = await fixtures.makeEvent({
      title: `${TOKEN} Fortnight Jazz`,
      startsAt: inDays(14),
    });
  });

  it.each([
    ["English", "jazz december"],
    ["French", "jazz décembre"],
    ["French, with its small word", "jazz en decembre"],
    ["Spanish", "jazz en diciembre"],
    ["German", "jazz im Dezember"],
    ["Portuguese", "jazz em dezembro"],
  ])("reads a month in %s", async (_language, words) => {
    const ids = await eventIdsFor(anon, `${TOKEN} ${words}`);
    expect(ids).toContain(december);
    expect(ids).not.toContain(june);
  });

  it.each([
    ["English", "tomorrow"],
    ["French", "demain"],
    ["Spanish", "mañana"],
    ["German", "morgen"],
    ["Portuguese", "amanhã"],
  ])("reads tomorrow in %s", async (_language, word) => {
    const ids = await eventIdsFor(anon, `${TOKEN} jazz ${word}`);
    expect(ids).toContain(tomorrow);
    expect(ids).not.toContain(later);
  });

  it.each([
    ["English", "this weekend"],
    ["French", "ce week-end"],
    ["Spanish", "este fin de semana"],
    ["German", "dieses Wochenende"],
    ["Portuguese", "este fim de semana"],
  ])(
    "reads the weekend in %s and drops the words around it",
    async (_language, words) => {
      // The window itself is the English one; what is checked here is that
      // the phrase is read as a date and leaves "jazz" alone: an event two
      // weeks ahead is outside any weekend that can be "this" one.
      const ids = await eventIdsFor(anon, `${TOKEN} jazz ${words}`);
      expect(ids).not.toContain(later);
      const { data, error } = await svc.rpc(
        "_search_temporal" as never,
        {
          p_norm: `jazz ${foldSearchText(words)}`,
          p_as_of: new Date().toISOString(),
          p_timezone: "Africa/Accra",
        } as never,
      );
      expect(error).toBeNull();
      const row = (data as unknown as { rest: string; date_from: string }[])[0];
      expect(row.rest).toBe("jazz");
      expect(row.date_from).not.toBeNull();
    },
  );

  it("keeps a small word that does not lead into the date", async () => {
    const { data } = await svc.rpc(
      "_search_temporal" as never,
      {
        p_norm: "le petit paris demain",
        p_as_of: new Date().toISOString(),
        p_timezone: "Africa/Accra",
      } as never,
    );
    const row = (data as unknown as { rest: string }[])[0];
    expect(row.rest).toBe("le petit paris");
  });

  it("leaves a query with no date as it was", async () => {
    const { data } = await svc.rpc(
      "_search_temporal" as never,
      {
        p_norm: "en vivo esta semana",
        p_as_of: new Date().toISOString(),
        p_timezone: "Africa/Accra",
      } as never,
    );
    const row = (
      data as unknown as { rest: string; date_from: string | null }[]
    )[0];
    expect(row.rest).toBe("en vivo esta semana");
    expect(row.date_from).toBeNull();
  });
});

describe("a typo in a dated search", () => {
  // One long word shared by both titles: it is most of the query, which is
  // what used to carry the June event into a December search.
  const WORD = `kpanlogo${TOKEN}`;
  let december: string;
  let june: string;
  let literal: string;

  beforeAll(async () => {
    december = await fixtures.makeEvent({
      title: `${WORD} Harmattan`,
      startsAt: nextInMonth(12),
    });
    june = await fixtures.makeEvent({
      title: `${WORD} Rainy`,
      startsAt: nextInMonth(6),
    });
    literal = await fixtures.makeEvent({
      title: `${TOKEN} December To Remember`,
      startsAt: nextInMonth(7),
    });
  });

  it("does not bring in an event outside the dates for a word it shares", async () => {
    const ids = await eventIdsFor(anon, `${WORD} december`);
    expect(ids).toContain(december);
    expect(ids).not.toContain(june);
  });

  it("forgives the typo inside the dates", async () => {
    const typo = WORD.replace("kpanlogo", "kpanlgo");
    const ids = await eventIdsFor(anon, `${typo} december`);
    expect(ids).toContain(december);
    expect(ids).not.toContain(june);
  });

  it("forgives it in French dates too", async () => {
    const typo = WORD.replace("kpanlogo", "kpanlgo");
    const ids = await eventIdsFor(anon, `${typo} en décembre`);
    expect(ids).toContain(december);
    expect(ids).not.toContain(june);
  });

  it("still finds a title that says the date word, typo elsewhere", async () => {
    expect(await eventIdsFor(anon, `${TOKEN} remembr december`)).toContain(
      literal,
    );
  });
});

describe("everyday words of the other languages", () => {
  let beach: string;
  let worship: string;

  beforeAll(async () => {
    // Neither listing carries the token or any word of the queries below:
    // only the vocabulary can connect them (no text, relaxed or typo
    // match).
    beach = await fixtures.makePlace(
      `Sunset Point ${crypto.randomUUID().slice(0, 6)}`,
      "A quiet beach with coconut trees and grilled tilapia.",
    );
    worship = await fixtures.makeEvent({
      title: `Lagoon Sunrise ${crypto.randomUUID().slice(0, 6)}`,
      description:
        "A morning of worship and praise by the lagoon, for everyone.",
      startsAt: inDays(8),
    });
  });

  it.each([
    ["French", "plage"],
    ["Spanish", "playa"],
    ["German", "Strand"],
    ["Portuguese", "praia"],
  ])("finds a beach in %s", async (_language, word) => {
    expect(await placeIdsFor(anon, word)).toContain(beach);
  });

  it.each([
    ["French", "évangile"],
    ["Spanish", "evangelio"],
    ["German", "Gottesdienst"],
    ["Portuguese", "evangelho"],
  ])("finds a worship morning in %s", async (_language, word) => {
    expect(await eventIdsFor(anon, word)).toContain(worship);
  });

  it("is one way until listings are written in that language", async () => {
    const related = async () => {
      const { data, error } = await svc.rpc(
        "_search_related_tsquery" as never,
        { p_norm: "party", p_scope: "event" } as never,
      );
      expect(error).toBeNull();
      return String(data);
    };
    // "soirée" finds a party; a search for "party" does not go looking for
    // "soirée" in a catalogue where no listing can say it.
    const one = await svc.rpc(
      "_search_related_tsquery" as never,
      { p_norm: "soiree", p_scope: "event" } as never,
    );
    expect(String(one.data)).toContain("'party'");
    expect(await related()).not.toContain("'soiree'");

    // Switched to two-way (what staff do when listings in French exist),
    // the English word reaches a listing written in French.
    const term = `${TOKEN}mot`;
    conceptTerms.push(term);
    await svc.from("search_concept" as never).insert({
      term,
      expands_to: ["party"],
      applies_to: ["event"],
      two_way: false,
    } as never);
    expect(await related()).not.toContain(`'${term}'`);
    const listing = await fixtures.makeEvent({
      title: `Grande ${term} ${crypto.randomUUID().slice(0, 6)}`,
      startsAt: inDays(7),
    });
    await svc
      .from("search_concept" as never)
      .update({ two_way: true } as never)
      .eq("term", term);
    expect(await related()).toContain(`'${term}'`);
    // "party" is a common word, so this listing is looked for by name.
    const { data: pool, error: poolError } = await svc.rpc(
      "_search_event_pool" as never,
      {
        p_norm: "party",
        p_organizer_id: organizer.id,
        p_category: null,
        p_origin: null,
        p_radius_km: null,
        p_as_of: new Date().toISOString(),
        p_limit: 400,
      } as never,
    );
    expect(poolError).toBeNull();
    expect((pool as unknown as { id: string }[]).map((r) => r.id)).toContain(
      listing,
    );
  });

  it("stores a term the way a query arrives", async () => {
    const term = `Crêpe${TOKEN}`;
    conceptTerms.push(foldSearchText(term));
    const { data, error } = await svc
      .from("search_concept" as never)
      .insert({
        term,
        expands_to: ["Galette Bretonne", "galette  bretonne", " ", "Blé noir"],
        applies_to: ["place"],
      } as never)
      .select("term, expands_to")
      .single();
    expect(error).toBeNull();
    const row = data as unknown as { term: string; expands_to: string[] };
    expect(row.term).toBe(`crepe${TOKEN}`);
    expect(row.expands_to).toEqual(["galette bretonne", "ble noir"]);
  });

  it("does not let a small French word widen a search", async () => {
    const maquis = await fixtures.makePlace(
      `${TOKEN}a Maquis Bleu`,
      "Poisson braisé et attiéké.",
    );
    const other = await fixtures.makePlace(
      `Chez ${TOKEN}b`,
      "Venez avec vos amis.",
    );
    // Nothing matches every word, so the search relaxes to any meaningful
    // word. "avec" is not one.
    const ids = await placeIdsFor(anon, `${TOKEN}a maquis avec`);
    expect(ids).toContain(maquis);
    expect(ids).not.toContain(other);
  });
});

describe("everywhere else a reader types words", () => {
  const LAT = 5.6037;
  const LNG = -0.187;

  it("the older events search folds, and a % is a character", async () => {
    const event = await fixtures.makeEvent({
      title: `Quiet Hour ${crypto.randomUUID().slice(0, 6)}`,
      description: `On se retrouve au Café ${TOKEN}vé, entrée libre pour tous.`,
      startsAt: inDays(5),
    });
    const search = async (text: string) => {
      const { data, error } = await anon.rpc("get_filtered_events", {
        p_min_price: null,
        p_max_price: null,
        p_start_date: null,
        p_end_date: null,
        p_user_lat: LAT,
        p_user_lng: LNG,
        p_max_distance_km: 50,
        p_search_text: text,
        p_event_category: null,
        p_event_type: null,
        p_min_rating: null,
        p_cursor_starts_at: null,
        p_cursor_distance_km: null,
        p_cursor_id: null,
        p_page_size: 1000,
      } as never);
      expect(error).toBeNull();
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    };
    expect(await search(`cafe ${TOKEN}ve`)).toContain(event);
    expect(await search(`CAFÉ ${TOKEN}VÉ`)).toContain(event);
    // It used to be a wildcard that matched every listing.
    expect(await search("%")).not.toContain(event);
    expect(await search("")).toContain(event);
  });

  it("the older places search folds", async () => {
    const place = await fixtures.makePlace(
      `Pâtisserie ${TOKEN}`,
      "Croissants and coffee from seven.",
    );
    const { data, error } = await anon.rpc("get_filtered_places", {
      p_search_text: `patisserie ${TOKEN}`,
      p_page_size: 1000,
    } as never);
    expect(error).toBeNull();
    expect(((data ?? []) as { id: string }[]).map((r) => r.id)).toContain(
      place,
    );
  });

  it("the field team's duplicate check sees the same name with and without accents", async () => {
    const place = await fixtures.makePlace(
      `Café ${TOKEN}dup Ɔdehyeɛ`,
      "Coffee, cakes and a quiet corner.",
    );
    const { data, error } = await svc.rpc(
      "fieldops_find_similar_places" as never,
      {
        p_name: `Cafe ${TOKEN}dup Odehyee`,
        p_lat: LAT,
        p_lng: LNG,
      } as never,
    );
    expect(error).toBeNull();
    const match = (
      (data ?? []) as unknown as { id: string; similarity: number }[]
    ).find((r) => r.id === place);
    expect(match).toBeDefined();
    expect(Number(match?.similarity)).toBe(1);
  });

  it("the inbox search folds the event's title and the other person's name", async () => {
    const member = await createTestUser(getServiceClient());
    try {
      const eventId = await fixtures.makeEvent({
        title: `Soirée ${TOKEN}conv`,
        startsAt: inDays(9),
      });
      const opened = await member.client.rpc("open_conversation", {
        p_type: "event",
        p_event_id: eventId,
      } as never);
      expect(opened.error).toBeNull();
      const conversationId = opened.data as unknown as string;

      const find = async (text: string) => {
        const { data, error } = await member.client.rpc("list_conversations", {
          p_filter: "all",
          p_search: text,
        } as never);
        expect(error).toBeNull();
        return (data ?? []).map((r) => r.conversation_id);
      };
      expect(await find(`soiree ${TOKEN}conv`)).toContain(conversationId);
      expect(await find(`desire ${TOKEN}son`)).toContain(conversationId);
      expect(await find(`${TOKEN}_org`)).toContain(conversationId);
      expect(await find("zzz-no-such-name-zzz")).not.toContain(conversationId);
      // No longer a wildcard.
      expect(await find("%")).not.toContain(conversationId);
    } finally {
      await svc
        .from("conversation")
        .delete()
        .in(
          "id",
          (
            await svc
              .from("conversation_participant")
              .select("conversation_id")
              .eq("user_id", member.id)
          ).data?.map((r) => r.conversation_id) ?? [],
        );
      await deleteTestUser(getServiceClient(), member.id);
    }
  });
});
