import { describe, expect, it } from "vitest";
import {
  X_MAX_LENGTH,
  clampWords,
  eventCaption,
  instagramListerTip,
  listingHashtags,
  placeCaption,
  roundupCaption,
  xCreditLine,
  xWeightedLength,
} from "./socialCaptions";

const links = {
  link: "https://abontenhub.com/events/ab12cd34?src=x",
  appLink: "https://abontenhub.com/go/app?src=x",
};

const event = {
  title: "Afrobeats Night at the Beach",
  when: "Sat, 28th Nov 2026 · 8:00 PM - 11:00 PM",
  venue: "Labadi Beach Hotel",
  price: "Tickets from GH₵50",
  offer: "tickets" as const,
  city: "Accra",
};

describe("xWeightedLength", () => {
  it("counts a link as 23 whatever its length", () => {
    expect(
      xWeightedLength("https://abontenhub.com/events/ab12cd34?src=x"),
    ).toBe(23);
    expect(xWeightedLength("Go: https://a.co")).toBe(4 + 23);
  });

  it("counts Latin letters as 1 and emoji or the cedi sign as 2", () => {
    expect(xWeightedLength("Accra é")).toBe(7);
    expect(xWeightedLength("📅")).toBe(2);
    expect(xWeightedLength("GH₵50")).toBe(6);
  });
});

describe("clampWords", () => {
  it("cuts on a word with an ellipsis", () => {
    expect(clampWords("One two three four five", 14)).toBe("One two three…");
    expect(clampWords("Short", 20)).toBe("Short");
  });
});

describe("listingHashtags", () => {
  it("names the city, or Ghana when it is unknown", () => {
    expect(listingHashtags("event", "Cape Coast")).toEqual([
      "#CapeCoastEvents",
      "#ThingsToDoInCapeCoast",
    ]);
    expect(listingHashtags("place", null)).toEqual([
      "#Ghana",
      "#ThingsToDoInGhana",
    ]);
  });
});

describe("eventCaption", () => {
  it("writes an X post with the facts, the link and the hashtags", () => {
    const text = eventCaption("x", event, links);
    expect(text).toBe(
      [
        "Afrobeats Night at the Beach",
        "",
        "📅 Sat, 28th Nov 2026 · 8:00 PM - 11:00 PM",
        "📍 Labadi Beach Hotel",
        "🎫 Tickets from GH₵50",
        "",
        links.link,
        "#AccraEvents #ThingsToDoInAccra",
      ].join("\n"),
    );
    expect(xWeightedLength(text)).toBeLessThanOrEqual(X_MAX_LENGTH);
  });

  it("keeps an X post under 280 with a very long title", () => {
    const text = eventCaption(
      "x",
      { ...event, title: "A very long event name ".repeat(9).trim() },
      links,
    );
    expect(xWeightedLength(text)).toBeLessThanOrEqual(X_MAX_LENGTH);
    expect(text).toContain(links.link);
    expect(text).toContain("📍 Labadi Beach Hotel");
  });

  it("leaves out the price line of an event with nothing on sale", () => {
    const text = eventCaption(
      "x",
      { ...event, price: null, offer: "none" },
      links,
    );
    expect(text).not.toContain("🎫");
  });

  it("adds the call to action and the app to the WhatsApp Channel post", () => {
    const text = eventCaption("wa_channel", event, {
      link: "https://abontenhub.com/events/ab12cd34?src=wa",
      appLink: "https://abontenhub.com/go/app?src=wa",
    });
    expect(text.startsWith("*Afrobeats Night at the Beach*")).toBe(true);
    expect(text).toContain(
      "Get your tickets: https://abontenhub.com/events/ab12cd34?src=wa",
    );
    expect(text).toContain("Get the app: https://abontenhub.com/go/app?src=wa");
  });

  it("gives an Instagram story the link sticker's words", () => {
    expect(eventCaption("ig_story", event, links)).toBe("Get tickets");
    expect(eventCaption("ig_story", { ...event, offer: "free" }, links)).toBe(
      "Reserve a spot",
    );
  });
});

describe("placeCaption", () => {
  const place = {
    name: "Republic Bar & Grill",
    category: "Bar",
    area: "Osu, Accra",
    city: "Accra",
  };

  it("writes an X post", () => {
    const text = placeCaption("x", place, links);
    expect(text).toBe(
      [
        "New on Abonten: Republic Bar & Grill",
        "Bar · Osu, Accra",
        "",
        links.link,
        "#Accra #ThingsToDoInAccra",
      ].join("\n"),
    );
  });

  it("writes a WhatsApp Channel post with the app link", () => {
    const text = placeCaption("wa_channel", { ...place, area: null }, links);
    expect(text).toContain("*New on Abonten: Republic Bar & Grill*\nBar\n");
    expect(text).toContain(`Get the app: ${links.appLink}`);
  });
});

describe("roundupCaption", () => {
  const roundup = {
    kind: "week" as const,
    dates: "23–29 Nov",
    city: "Accra",
    events: Array.from({ length: 10 }, (_, i) => ({
      title: `Event number ${i + 1} with a fairly long name`,
      when: "Fri 27 Nov, 8:00 pm",
      venue: "Somewhere in Osu",
    })),
  };

  it("lists every event on Instagram, numbered", () => {
    const text = roundupCaption("ig_feed", roundup, links);
    expect(text.startsWith("What's on in Accra this week (23–29 Nov) 👇")).toBe(
      true,
    );
    expect(text).toContain(
      "10. Event number 10 with a fairly long name · Fri 27 Nov, 8:00 pm · Somewhere in Osu",
    );
  });

  it("fits as many events as X allows and says how many more", () => {
    const text = roundupCaption("x", roundup, links);
    expect(xWeightedLength(text)).toBeLessThanOrEqual(X_MAX_LENGTH);
    expect(text).toContain("• Event number 1 with a fairly long name");
    expect(text).toMatch(/\+ \d+ more/);
    expect(text).toContain(links.link);
  });

  it("names the weekend", () => {
    const text = roundupCaption(
      "wa_channel",
      {
        ...roundup,
        kind: "weekend",
        dates: "27–29 Nov",
        events: roundup.events.slice(0, 2),
      },
      links,
    );
    expect(text.startsWith("*This weekend in Accra (27–29 Nov)*")).toBe(true);
    expect(text).toContain(`Tickets and details: ${links.link}`);
  });
});

describe("crediting the lister", () => {
  it("ends an X post with via @handle, before the link", () => {
    const text = eventCaption("x", event, links, { x: "djkwame" });
    expect(text).toBe(
      [
        "Afrobeats Night at the Beach",
        "",
        "📅 Sat, 28th Nov 2026 · 8:00 PM - 11:00 PM",
        "📍 Labadi Beach Hotel",
        "🎫 Tickets from GH₵50",
        "",
        "via @djkwame",
        links.link,
        "#AccraEvents #ThingsToDoInAccra",
      ].join("\n"),
    );
  });

  it("keeps the credit and drops hashtags first when X runs out of room", () => {
    const long = { ...event, title: "Night ".repeat(25).trim() };
    // Without a credit, one hashtag still fits.
    expect(eventCaption("x", long, links)).toContain("#AccraEvents");
    const text = eventCaption("x", long, links, { x: "a_fifteen_chars" });
    expect(xWeightedLength(text)).toBeLessThanOrEqual(X_MAX_LENGTH);
    expect(text).toContain("via @a_fifteen_chars");
    expect(text).toContain(links.link);
    // With it, the hashtags went first.
    expect(text).not.toContain("#");
  });

  it("credits a place's X account", () => {
    const text = placeCaption(
      "x",
      {
        name: "Republic Bar & Grill",
        category: "Bar",
        area: "Osu, Accra",
        city: "Accra",
      },
      links,
      { x: "republicosu" },
    );
    expect(text.split("\n")).toContain("via @republicosu");
  });

  it("credits nobody without an X handle, and only on X", () => {
    expect(eventCaption("x", event, links, { x: null })).not.toContain("via @");
    expect(eventCaption("x", event, links, {})).toBe(
      eventCaption("x", event, links),
    );
    expect(
      eventCaption("wa_channel", event, links, { x: "djkwame" }),
    ).not.toContain("@djkwame");
    expect(xCreditLine({ x: "@djkwame" })).toBe("via @djkwame");
    expect(xCreditLine({ x: "  " })).toBeNull();
  });

  it("tells the founder to mention the Instagram account", () => {
    expect(instagramListerTip("djkwame")).toBe(
      "Mention @djkwame in the Story (or send a Collab invite on a feed post), then ask them to reshare.",
    );
    expect(instagramListerTip(null)).toBeNull();
    expect(instagramListerTip("")).toBeNull();
  });
});
