import JsonLd from "@/components/atoms/JsonLd";
import { languageAlternates } from "@/i18n/alternates";
import LandingAuthLinks from "@/landingPage/molecules/LandingAuthLinks";
import LandingLocationSearch from "@/landingPage/organisms/LandingLocationSearch";
import LandingSections from "@/landingPage/organisms/LandingSections";
import { DEFAULT_SHARE_IMAGE } from "@/utils/defaultShareImage";
import { indexedCities } from "@/utils/searchIndexing";
import { SIGN_OFF } from "@abonten/core/brand/signOff";
import { countryName } from "@abonten/core/geo/countries";
import {
  jsonLdGraph,
  organizationJsonLd,
  websiteJsonLd,
} from "@abonten/core/seo/jsonLd";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import landingHero from "../../../../public/assets/images/landing-hero.jpg";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Prerendered per language; the list of launched cities is read again at
// most once an hour, so a city launched in Admin › Markets appears without
// a deploy.
export const revalidate = 3600;

// The country Abonten is live in, by name, when there is exactly one: the
// words people search with ("events in Ghana").
async function liveCountry(locale: string): Promise<string | null> {
  const countries = [
    ...new Set((await indexedCities()).map((c) => c.countryCode)),
  ];
  return countries.length === 1 ? countryName(countries[0], locale) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("metadata");
  const country = await liveCountry(locale);
  const title = country ? t("homeTitleIn", { country }) : t("homeTitle");
  const description = country
    ? t("homeDescriptionIn", { country })
    : t("homeDescription");
  return {
    // The brand is in the title already; the root template would add it again.
    title: { absolute: title },
    description,
    alternates: languageAlternates("/", locale),
    openGraph: {
      siteName: "Abonten Hub",
      type: "website",
      url: "/",
      title,
      description,
      images: [DEFAULT_SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SHARE_IMAGE.url],
    },
  };
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("landing");
  const cities = await indexedCities();

  return (
    <>
      {/* The site's name and logo in search results, and its profiles. */}
      <JsonLd
        data={jsonLdGraph([organizationJsonLd(), websiteJsonLd(locale)])}
      />
      <div className="bg-night w-full h-dvh relative text-white flex flex-col items-center">
        {/* The crowd photo through next/image: sized per screen and served as
            AVIF/WebP (the CSS background shipped the 2.6 MB original to
            every phone), with a blurred preview while it loads. */}
        <Image
          src={landingHero}
          alt=""
          fill
          priority
          placeholder="blur"
          // Cropped to cover: on a tall screen the landscape photo is drawn
          // about 1.5 screen-heights wide, not one screen-width.
          sizes="(max-aspect-ratio: 3/2) 150vh, 100vw"
          className="object-cover object-bottom"
        />
        {/* Header: part of the photo, so it scrolls away with it. */}
        <nav className="absolute w-full bg-gradient-to-b from-black/60 to-transparent flex justify-center z-10">
          <div className="flex justify-between items-center py-5 w-[90%]">
            <Link href="/" aria-label={t("abontenHome")}>
              {/* The ABƆNTEN logotype: the landing page is the one place
                  with room for the full word at a readable size. */}
              <Image
                src="/assets/images/brand/abonten-logotype-night.svg"
                alt={t("abonten")}
                width={213}
                height={40}
                priority
                className="h-8 w-auto md:h-10"
              />
            </Link>

            <LandingAuthLinks />
          </div>
        </nav>

        {/* overlay: darker at the foot, where the search and sign-off sit */}
        <div className="absolute flex justify-center items-center w-full h-dvh bg-gradient-to-b from-black/40 via-black/35 to-black/70">
          {/* Hero */}
          <div className="w-[90%] flex flex-col items-center gap-8 lg:items-start lg:gap-10">
            <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-left">
              <h1 className="max-w-[16ch] font-bold text-[2.5rem] leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-7xl">
                {t("connectingPeopleToExperiences")}
              </h1>
              <p className="max-w-md text-base text-white/80 text-pretty md:text-lg">
                {t("findEventsAndPlacesNearYou")}
              </p>
            </div>

            <LandingLocationSearch />
          </div>

          {/* The brand's sign-off: one credit line on the homepage, never on
              money, tickets, support, legal pages or errors. */}
          <p className="absolute bottom-6 inset-x-0 px-4 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 text-balance md:text-[11px] md:tracking-[0.18em]">
            {SIGN_OFF}
          </p>
        </div>
      </div>

      <LandingSections cities={cities} />
    </>
  );
}
