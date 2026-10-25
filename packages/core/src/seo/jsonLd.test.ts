import { describe, expect, it } from "vitest";
import {
  breadcrumbJsonLd,
  jsonLdGraph,
  openingHoursSpecification,
  organizationJsonLd,
  placeSchemaType,
  plainProfileUrl,
  postalAddress,
  websiteJsonLd,
} from "./jsonLd";

describe("organization and website", () => {
  it("names the site and links its profiles without tracking", () => {
    const org = organizationJsonLd();
    expect(org.name).toBe("Abonten Hub");
    expect(org.url).toBe("https://abontenhub.com/");
    const sameAs = org.sameAs as string[];
    expect(sameAs.length).toBeGreaterThan(0);
    for (const href of sameAs) expect(href).not.toContain("?");
    const site = websiteJsonLd("fr");
    expect(site.inLanguage).toBe("fr");
    expect(site.publisher).toEqual({ "@id": org["@id"] });
  });

  it("strips the query a share sheet adds to a profile link", () => {
    expect(plainProfileUrl("https://x.com/abontenhub?s=11&t=abc")).toBe(
      "https://x.com/abontenhub",
    );
    expect(plainProfileUrl("not a url")).toBe("not a url");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers the trail and makes each step absolute", () => {
    expect(
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Accra", path: "/explore/accra" },
      ]),
    ).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://abontenhub.com/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Accra",
          item: "https://abontenhub.com/explore/accra",
        },
      ],
    });
  });

  it("leaves empty nodes out of a graph", () => {
    expect(jsonLdGraph([{ "@type": "Thing" }, null, undefined])).toEqual({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Thing" }],
    });
  });
});

describe("placeSchemaType", () => {
  it("names the closest kind of business, else LocalBusiness", () => {
    expect(placeSchemaType("nightclub")).toBe("NightClub");
    expect(placeSchemaType("restaurant")).toBe("Restaurant");
    expect(placeSchemaType("other")).toBe("LocalBusiness");
    expect(placeSchemaType(null)).toBe("LocalBusiness");
  });
});

describe("openingHoursSpecification", () => {
  it("lists open days, leaves closed ones out and keeps late closings", () => {
    expect(
      openingHoursSpecification([
        {
          day_of_week: 5,
          open_time: "22:00:00",
          close_time: "04:00:00",
          is_closed: false,
        },
        { day_of_week: 0, open_time: null, close_time: null, is_closed: true },
      ]),
    ).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Friday",
        opens: "22:00",
        closes: "04:00",
      },
    ]);
  });
});

describe("postalAddress", () => {
  it("keeps the listing's line and adds the city and country", () => {
    expect(
      postalAddress({ line: " Osu, Accra ", city: "Accra", countryCode: "gh" }),
    ).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Osu, Accra",
      addressLocality: "Accra",
      addressCountry: "GH",
    });
    expect(postalAddress({ line: "" })).toBeUndefined();
  });
});
