import type { IndexedCity } from "@/utils/searchIndexing";
import { cityPath } from "@abonten/core/seo/paths";
import { WEEKLY_PRODUCT_NAME } from "@abonten/core/weekly/copy";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FiArrowRight, FiArrowUpRight } from "react-icons/fi";

// The homepage below the photo: the launched cities and what Abonten is
// for, as ordinary links. The hero only offers a search box, so without
// this a search engine reaching the homepage found nowhere to go (three
// links, all to sign-in) and people arriving from a search had nothing to
// read before typing.
export default async function LandingSections({
  cities,
}: {
  cities: IndexedCity[];
}) {
  const t = await getTranslations("landing");

  const features = [
    {
      title: t("findWhatsOn"),
      body: t("findWhatsOnBody"),
      link: t("exploreEvents"),
      href: "/explore",
    },
    {
      title: WEEKLY_PRODUCT_NAME,
      body: t("weeklyBody"),
      link: t("seeThePicks"),
      href: "/weekly",
    },
    {
      title: t("hostOnAbonten"),
      body: t("hostBody"),
      link: t("startHosting"),
      href: "/help/organizers/creating-and-publishing-events",
    },
  ];

  return (
    <div className="bg-background text-foreground">
      {cities.length > 0 ? (
        <section
          aria-labelledby="landing-cities"
          className="mx-auto w-[90%] py-16 md:py-24"
        >
          <h2
            id="landing-cities"
            className="text-2xl font-bold tracking-tight text-balance md:text-4xl"
          >
            {t("exploreACity")}
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground text-pretty">
            {t("exploreACityIntro")}
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cities.map((city) => (
              <li key={`${city.countryCode}-${city.slug}`}>
                <Link
                  href={cityPath(city.slug)}
                  className="group flex h-full min-h-28 flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-4 text-card-foreground transition-colors hover:border-primary hover:bg-accent md:p-5"
                >
                  <span className="text-xs text-muted-foreground md:text-sm">
                    {t("eventsAndPlaces")}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-base font-semibold md:text-lg">
                    {city.name}
                    <FiArrowUpRight
                      aria-hidden
                      className="shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-label={t("whatYouCanDoOnAbonten")}
        className="border-t border-border"
      >
        <ul className="mx-auto grid w-[90%] gap-10 py-16 md:grid-cols-3 md:gap-8 md:py-24">
          {features.map((feature) => (
            <li key={feature.href} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground text-pretty">
                {feature.body}
              </p>
              <Link
                href={feature.href}
                className="mt-auto inline-flex items-center gap-2 self-start text-sm font-semibold text-primary hover:underline"
              >
                {feature.link}
                <FiArrowRight aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
