import { publicSupabase } from "@/config/supabase/publicClient";
import { rowOrFailure } from "@/utils/rowOrFailure";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import {
  buildAvatarUrl,
  buildCloudinaryUrl,
} from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { readEventAddress } from "@abonten/core/eventAddress";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  type ShareImageFormat,
  type ShareSubjectKind,
  eventShareOffer,
  shareSubjectPath,
} from "@abonten/core/shareKit/shareKit";
import { coreTranslator, serverTranslator } from "@abonten/i18n/server";
import type { ListingCard, WelcomeCard } from "./ShareImageLayouts";
import { type ShareAssets, loadPictureDataUri, qrDataUri } from "./shareAssets";

// The words and pictures of one share image, read the way the public pages
// read them (the anonymous client: only what anyone may see). A listing that
// is not public, or an event that was cancelled, has no share image.

export type ShareCardResult =
  | { kind: "listing"; card: ListingCard }
  | { kind: "welcome"; card: WelcomeCard }
  | { kind: "not_found" };

/** "Spintex Road, Accra, Ghana" → "Spintex Road, Accra": the short form. */
function shortAddress(full: string): string {
  return full
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

function siteLinks(kind: ShareSubjectKind, key: string) {
  const path = shareSubjectPath(kind, key);
  return {
    url: `${PUBLIC_SITE_ORIGIN}${path}`,
    displayUrl: `${PUBLIC_SITE_ORIGIN.replace(/^https?:\/\//, "")}${path}`,
  };
}

async function eventCard(
  code: string,
  format: ShareImageFormat,
  locale: string,
  assets: ShareAssets,
): Promise<ShareCardResult> {
  const row = rowOrFailure(
    await publicSupabase
      .from("event")
      .select(
        "event_code, title, starts_at, ends_at, timezone, address, status, flyer_public_id, flyer_version, event_occurrence(starts_at, ends_at), ticket_type(type, price, currency), place:place_id(name)",
      )
      .eq("event_code", code.toUpperCase())
      .maybeSingle(),
    "share event",
  );
  if (!row || row.status === "canceled") return { kind: "not_found" };

  const t = serverTranslator(locale, "server");
  const { date, time } = getFormattedEventDate(
    row.starts_at,
    row.ends_at,
    row.event_occurrence ?? [],
    row.timezone,
    locale,
  );
  const offer = eventShareOffer(row.ticket_type ?? []);
  const price =
    offer.kind === "tickets"
      ? t(offer.single ? "shareKit.ticketsAt" : "shareKit.ticketsFrom", {
          price: formatMoney(offer.currency, offer.fromAmount, {
            locale,
            trimZeroFraction: true,
          }),
        })
      : offer.kind === "free"
        ? t("shareKit.freeEntry")
        : null;
  const cta =
    offer.kind === "tickets"
      ? t("shareKit.ctaTickets")
      : offer.kind === "free"
        ? t("shareKit.ctaFree")
        : t("shareKit.ctaDetails");
  const place = row.place as { name: string | null } | null;
  const venue =
    place?.name || shortAddress(readEventAddress(row.address).full_address);
  const links = siteLinks("events", row.event_code);
  const width = format === "story" ? 476 : 484;
  const [picture, qr] = await Promise.all([
    row.flyer_public_id && row.flyer_version
      ? loadPictureDataUri(
          buildCloudinaryUrl(row.flyer_public_id, row.flyer_version, {
            width,
            format: "jpg",
          }),
        )
      : Promise.resolve(null),
    qrDataUri(links.url),
  ]);
  return {
    kind: "listing",
    card: {
      title: row.title ?? "",
      highlight: time ? `${date} · ${time}` : date,
      detail: venue || null,
      price,
      cta,
      displayUrl: links.displayUrl,
      picture,
      pictureFit: "contain",
      qr,
      mark: assets.mark,
      wordmark: assets.wordmark,
    },
  };
}

async function placeCard(
  slug: string,
  format: ShareImageFormat,
  locale: string,
  assets: ShareAssets,
): Promise<ShareCardResult> {
  const row = rowOrFailure(
    await publicSupabase
      .from("place")
      .select(
        "slug, name, address, cover_public_id, cover_version, place_category(name, slug)",
      )
      .eq("slug", slug)
      .maybeSingle(),
    "share place",
  );
  if (!row) return { kind: "not_found" };

  const t = serverTranslator(locale, "server");
  const category = row.place_category as {
    name: string | null;
    slug: string | null;
  } | null;
  const categoryLabel = category
    ? placeCategoryLabel(coreTranslator(locale), category)
    : null;
  const area = shortAddress(readEventAddress(row.address).full_address);
  const links = siteLinks("places", row.slug);
  const [picture, qr] = await Promise.all([
    row.cover_public_id && row.cover_version
      ? loadPictureDataUri(
          buildCloudinaryUrl(row.cover_public_id, row.cover_version, {
            width: 484,
            format: "jpg",
          }),
        )
      : Promise.resolve(null),
    qrDataUri(links.url),
  ]);

  if (format === "welcome") {
    return {
      kind: "welcome",
      card: {
        heading: t("shareKit.welcomeHeading"),
        name: row.name,
        line: t("shareKit.welcomePlace"),
        displayUrl: links.displayUrl,
        picture,
        pictureShape: "wide",
        qr,
        mark: assets.mark,
        wordmark: assets.wordmark,
      },
    };
  }
  return {
    kind: "listing",
    card: {
      title: row.name,
      highlight: categoryLabel || null,
      detail: area || null,
      price: null,
      cta: t("shareKit.ctaPlace"),
      displayUrl: links.displayUrl,
      picture,
      pictureFit: "cover",
      qr,
      mark: assets.mark,
      wordmark: assets.wordmark,
    },
  };
}

type PublicProfile = {
  username?: string;
  full_name?: string | null;
  avatar_public_id?: string | null;
  avatar_version?: string | number | null;
  status_id?: number | null;
};

async function profileCard(
  username: string,
  locale: string,
  assets: ShareAssets,
): Promise<ShareCardResult> {
  const { data, error } = await publicSupabase.rpc("get_public_profile", {
    p_username: username,
  });
  if (error) throw new Error(`share profile lookup failed: ${error.message}`);
  const profile = data as PublicProfile | null;
  // Status 1 is an active account; deleted, banned and restricted accounts
  // get no welcome card.
  if (!profile?.username || profile.status_id !== 1) {
    return { kind: "not_found" };
  }
  const t = serverTranslator(locale, "server");
  const links = siteLinks("profiles", profile.username);
  const [picture, qr] = await Promise.all([
    loadPictureDataUri(
      buildAvatarUrl(profile.avatar_public_id, profile.avatar_version, {
        width: 160,
        height: 160,
        format: "jpg",
      }),
    ),
    qrDataUri(links.url),
  ]);
  return {
    kind: "welcome",
    card: {
      heading: t("shareKit.welcomeHeading"),
      name: profile.full_name || profile.username,
      line: t("shareKit.welcomeOrganizer"),
      displayUrl: links.displayUrl,
      picture,
      pictureShape: "round",
      qr,
      mark: assets.mark,
      wordmark: assets.wordmark,
    },
  };
}

export function loadShareCard(
  kind: ShareSubjectKind,
  key: string,
  format: ShareImageFormat,
  locale: string,
  assets: ShareAssets,
): Promise<ShareCardResult> {
  if (kind === "events") return eventCard(key, format, locale, assets);
  if (kind === "places") return placeCard(key, format, locale, assets);
  return profileCard(key, locale, assets);
}
