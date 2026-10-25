import { SUPPORT_EMAIL } from "../brand/contacts";
import { LEGAL_ENTITY_NAME } from "../brand/legalEntity";
import { PUBLIC_SITE_ORIGIN, SOCIAL_LINKS } from "../brand/socialLinks";

// schema.org pieces that more than one public page uses. Search engines read
// them for the site's name and logo in results (Organization, WebSite), the
// trail shown above a result (BreadcrumbList) and a venue's kind, address
// and hours (LocalBusiness). Only facts a signed-out visitor can already see
// go in.

export const SITE_NAME = "Abonten Hub";
export const ORGANIZATION_ID = `${PUBLIC_SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${PUBLIC_SITE_ORIGIN}/#website`;
/** Square, at least 112 px: what Google asks of an organization's logo. */
export const LOGO_PATH = "/assets/images/brand/abonten-app-icon-512.png";

/** A profile link without the share-sheet tracking it was copied with. */
export function plainProfileUrl(href: string): string {
  try {
    const url = new URL(href);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return href;
  }
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: "Abonten",
    legalName: LEGAL_ENTITY_NAME,
    url: `${PUBLIC_SITE_ORIGIN}/`,
    logo: {
      "@type": "ImageObject",
      url: `${PUBLIC_SITE_ORIGIN}${LOGO_PATH}`,
      width: 512,
      height: 512,
    },
    sameAs: SOCIAL_LINKS.map((link) => plainProfileUrl(link.href)),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SUPPORT_EMAIL,
    },
  };
}

/** The site itself: the name a search engine shows beside the address. */
export function websiteJsonLd(locale: string): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    alternateName: ["Abonten", "abontenhub.com"],
    url: `${PUBLIC_SITE_ORIGIN}/`,
    inLanguage: locale,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export type Crumb = { name: string; path: string };

/** Home › … › this page. `path` is site-relative ("/explore/accra"). */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${PUBLIC_SITE_ORIGIN}${crumb.path}`,
    })),
  };
}

/** One graph per page, so every node shares one @context. */
export function jsonLdGraph(
  nodes: (Record<string, unknown> | null | undefined)[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((n): n is Record<string, unknown> => Boolean(n)),
  };
}

/**
 * The schema.org kind of business for a place category (place_category.slug).
 * A category with no closer kind is a plain LocalBusiness.
 */
const PLACE_SCHEMA_TYPES: Record<string, string> = {
  restaurant: "Restaurant",
  "food-spot": "FoodEstablishment",
  pub: "BarOrPub",
  nightclub: "NightClub",
  "gaming-center": "EntertainmentBusiness",
  cinema: "MovieTheater",
  "gym-fitness": "ExerciseGym",
  hotel: "Hotel",
  supermarket: "GroceryStore",
  skating: "SportsActivityLocation",
  "go-karting": "SportsActivityLocation",
  entertainment: "EntertainmentBusiness",
};

export function placeSchemaType(categorySlug: string | null | undefined) {
  return (categorySlug && PLACE_SCHEMA_TYPES[categorySlug]) || "LocalBusiness";
}

const SCHEMA_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type OpeningHoursRow = {
  /** 0 = Sunday … 6 = Saturday (the database's convention). */
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
};

/**
 * A place's week as schema.org opening hours. Closed days are left out,
 * which is how schema.org reads "closed". A night that runs past midnight
 * keeps its closing time ("22:00" to "04:00").
 */
export function openingHoursSpecification(
  rows: OpeningHoursRow[],
): Record<string, unknown>[] {
  return rows.flatMap((row) => {
    const day = SCHEMA_DAYS[row.day_of_week];
    if (row.is_closed || !day || !row.open_time || !row.close_time) return [];
    return [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${day}`,
        opens: row.open_time.slice(0, 5),
        closes: row.close_time.slice(0, 5),
      },
    ];
  });
}

/**
 * An address as schema.org takes it. Listings keep one free-text line, so
 * the line is the street address and the city and country come from what
 * the listing is known to be in.
 */
export function postalAddress(input: {
  line: string | null | undefined;
  city?: string | null;
  countryCode?: string | null;
}): Record<string, unknown> | undefined {
  const line = input.line?.trim();
  if (!line && !input.city) return undefined;
  return {
    "@type": "PostalAddress",
    ...(line ? { streetAddress: line } : {}),
    ...(input.city ? { addressLocality: input.city } : {}),
    ...(input.countryCode
      ? { addressCountry: input.countryCode.trim().toUpperCase() }
      : {}),
  };
}
