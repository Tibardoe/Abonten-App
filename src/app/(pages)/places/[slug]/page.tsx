import { getNearByPlaces } from "@/actions/getNearByPlaces";
import { getPlaceBySlug } from "@/actions/getPlaceBySlug";
import { getPlaceReviews } from "@/actions/getPlaceReviews";
import { getPlaceUpcomingEvents } from "@/actions/getPlaceUpcomingEvents";
import StarRatingDisplay from "@/components/atoms/Rating";
import EventCard from "@/components/molecules/EventCard";
import LocationMapPreview from "@/components/molecules/LocationMapPreview";
import PlaceViewLogger from "@/places/atoms/PlaceViewLogger";
import AddPlaceToFavoriteButton from "@/places/molecules/AddPlaceToFavoriteButton";
import ClaimPlaceButton from "@/places/molecules/ClaimPlaceButton";
import PlaceCard from "@/places/molecules/PlaceCard";
import PlaceOpenStatusBadge from "@/places/molecules/PlaceOpenStatusBadge";
import PlaceOpeningHoursTable from "@/places/molecules/PlaceOpeningHoursTable";
import PlaceWebsiteLink from "@/places/molecules/PlaceWebsiteLink";
import VerifiedBadge from "@/places/molecules/VerifiedBadge";
import PlaceActionButtons from "@/places/organisms/PlaceActionButtons";
import PlaceReviewsSection from "@/places/organisms/PlaceReviewsSection";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { computePlaceOpenStatus } from "@/utils/computePlaceOpenStatus";
import { parseWKBHex } from "@/utils/parseWKBHex";
import type { Metadata } from "next";
import Image from "next/image";
import { FiGlobe, FiMapPin, FiPhone } from "react-icons/fi";
import { IoLocationOutline, IoLogoWhatsapp } from "react-icons/io5";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Place details are public and don't depend on the viewer, so this page can
// be statically rendered and revalidated periodically (ISR) instead of
// re-querying Supabase on every request -- same reasoning/window as the
// event details page.
export const revalidate = 60;

// How far around a place to look for "Similar Places" -- matches
// getSimilarEvents.ts's 10km radius convention for the analogous "similar
// events" widget.
const SIMILAR_PLACES_RADIUS_METERS = 10000;
const SIMILAR_PLACES_LIMIT = 6;

type PlaceAddress = { full_address?: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const response = await getPlaceBySlug(slug);

  if (response.status !== 200 || !response.data) {
    return { title: "Place not found" };
  }

  const place = response.data;
  const categoryName = place.place_category?.name as string | undefined;
  const addressText = (place.address as PlaceAddress)?.full_address;
  const location = [categoryName, addressText].filter(Boolean).join(" · ");

  return {
    title: categoryName
      ? `${place.name} - ${categoryName} | Abonten Hub`
      : `${place.name} | Abonten Hub`,
    description: place.description
      ? place.description.slice(0, 155)
      : location || undefined,
  };
}

export default async function page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const placeResponse = await getPlaceBySlug(slug);

  if (placeResponse.status !== 200 || !placeResponse.data) {
    return <p className="p-8 text-center">Place not found</p>;
  }

  const place = placeResponse.data;

  // Upcoming events and the first reviews page only depend on the place's
  // id (not on each other), so fetch them concurrently -- same pattern as
  // the event details page's Promise.all for its independent fetches.
  const [upcomingEventsResponse, reviewsFirstPage] = await Promise.all([
    getPlaceUpcomingEvents(place.id),
    getPlaceReviews(place.id),
  ]);

  // Similar Places genuinely depends on this place's own category+location,
  // so it stays sequential -- same reasoning getSimilarEvents' sequential
  // fetch gets on the event details page.
  const { eventLat: placeLat, eventLng: placeLng } = parseWKBHex(
    place.location,
  );
  const nearbyPlacesResponse = await getNearByPlaces(
    placeLat,
    placeLng,
    SIMILAR_PLACES_RADIUS_METERS,
    { pageSize: 20 },
  );
  const similarPlaces = (
    nearbyPlacesResponse.status === 200 ? nearbyPlacesResponse.data : []
  )
    .filter((p) => p.id !== place.id && p.category_id === place.category_id)
    .slice(0, SIMILAR_PLACES_LIMIT);

  async function fetchReviewsPage(cursor: string | null) {
    "use server";
    return getPlaceReviews(place.id, { cursor });
  }

  const categoryName = place.place_category?.name ?? "Place";
  const fullAddress =
    (place.address as PlaceAddress)?.full_address ?? "Address not specified";
  const openStatus = computePlaceOpenStatus(
    place.openingHours,
    place.temporary_status,
  );
  const galleryPhotos = place.photos ?? [];
  const services = place.services ?? [];
  const upcomingEvents =
    upcomingEventsResponse.status === 200 ? upcomingEventsResponse.data : [];

  return (
    <div className="bg-background">
      <PlaceViewLogger placeId={place.id} />

      {/* Hero Section */}
      <div className="relative h-72 md:h-[500px] bg-muted">
        <Image
          src={buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
            width: 1280,
            height: 500,
          })}
          alt={place.name}
          fill
          className="object-cover object-center"
          priority
          sizes="(max-width: 768px) 100vw, 80vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-overlay/80 via-overlay/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-8 space-y-1.5 md:space-y-4">
          <div className="flex items-start justify-between gap-2 md:gap-3">
            <h1 className="text-xl md:text-4xl lg:text-5xl font-bold text-white drop-shadow-2xl line-clamp-2">
              {place.name}
            </h1>
            <div className="text-white shrink-0 mt-1 md:mt-2 flex items-center gap-1 md:gap-2">
              <ClaimPlaceButton
                placeId={place.id}
                placeName={place.name}
                ownerId={place.owner_id}
              />
              <AddPlaceToFavoriteButton placeId={place.id} compact />
            </div>
          </div>

          <div className="flex gap-1.5 md:gap-2 items-center overflow-x-auto scrollbar-hide -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap">
            <span className="shrink-0 px-2 py-1 md:px-4 md:py-2 bg-black/20 backdrop-blur-sm rounded-full text-white text-xs md:text-base">
              {categoryName}
            </span>
            {place.verified && (
              <span className="shrink-0 px-2 py-1 md:px-4 md:py-2 bg-black/20 backdrop-blur-sm rounded-full text-xs md:text-base">
                <VerifiedBadge />
              </span>
            )}
            <span className="shrink-0 px-2 py-1 md:px-4 md:py-2 bg-black/20 backdrop-blur-sm rounded-full text-xs md:text-base">
              <PlaceOpenStatusBadge status={openStatus} />
            </span>
            <span className="shrink-0 px-2 py-1 md:px-4 md:py-2 bg-black/20 backdrop-blur-sm rounded-full text-white flex items-center gap-1.5 text-xs md:text-base">
              <StarRatingDisplay rating={place.avgRating} />
              <span>
                {place.avgRating.toFixed(1)} ({place.reviewCount})
              </span>
            </span>
          </div>

          <div className="flex items-start gap-1.5 md:gap-2 text-white/90 text-xs md:text-base max-w-2xl">
            <IoLocationOutline className="mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1 md:line-clamp-none">
              {fullAddress}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 lg:px-8 py-8 md:py-12">
        <div className="md:grid lg:grid-cols-3 gap-6 md:gap-8 flex flex-col mb-5">
          <div className="lg:col-span-2 space-y-6 md:space-y-8">
            {/* Primary Actions */}
            <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
              <PlaceActionButtons
                placeId={place.id}
                placeName={place.name}
                ownerId={place.owner_id}
                location={place.location}
                phone={place.phone}
                whatsapp={place.whatsapp}
                services={services}
              />
            </div>

            {/* About */}
            <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-xl md:text-2xl font-medium mb-3 md:mb-4 text-card-foreground">
                About
              </h2>
              <p className="text-muted-foreground leading-relaxed text-sm md:text-base whitespace-pre-line">
                {place.description}
              </p>
            </div>

            {/* Opening Hours */}
            <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-xl md:text-2xl font-medium mb-3 md:mb-4 text-card-foreground">
                Opening Hours
              </h2>
              <PlaceOpeningHoursTable openingHours={place.openingHours} />
            </div>

            {/* Services */}
            {services.length > 0 && (
              <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
                <h2 className="text-xl md:text-2xl font-medium mb-3 md:mb-4 text-card-foreground">
                  Services
                </h2>
                <div className="space-y-4">
                  {services.map(
                    (service: {
                      id: string;
                      name: string;
                      description: string | null;
                      price: number | null;
                      price_unit: string | null;
                      show_price: boolean;
                    }) => (
                      <div
                        key={service.id}
                        className="flex items-start justify-between gap-4 pb-4 border-b border-border last:border-0 last:pb-0"
                      >
                        <div>
                          <h3 className="font-medium text-card-foreground">
                            {service.name}
                          </h3>
                          {service.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {service.description}
                            </p>
                          )}
                        </div>
                        {service.show_price && service.price != null && (
                          <span className="shrink-0 font-medium text-card-foreground">
                            {service.price}
                            {service.price_unit
                              ? ` / ${service.price_unit}`
                              : ""}
                          </span>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Photos */}
            {galleryPhotos.length > 0 && (
              <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
                <h2 className="text-xl md:text-2xl font-medium mb-3 md:mb-4 text-card-foreground">
                  Photos
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3">
                  {galleryPhotos.map(
                    (photo: {
                      id: string;
                      public_id: string;
                      version: string;
                    }) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square rounded-lg overflow-hidden"
                      >
                        <Image
                          src={buildCloudinaryUrl(
                            photo.public_id,
                            photo.version,
                            { width: 300, height: 300 },
                          )}
                          alt={`${place.name} photo`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 25vw"
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Reviews */}
            <PlaceReviewsSection
              placeId={place.id}
              ownerId={place.owner_id}
              avgRating={place.avgRating}
              reviewCount={place.reviewCount}
              initialPage={reviewsFirstPage}
              fetchPage={fetchReviewsPage}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-4 md:space-y-6">
            {/* Location */}
            <div className="bg-card text-card-foreground p-4 md:p-6 rounded-xl shadow-sm">
              <div className="flex items-center gap-1 md:gap-4 mb-3 md:mb-4">
                <FiMapPin className="text-xl md:text-2xl text-foreground" />
                <h3 className="text-lg font-medium">Location</h3>
              </div>
              <p className="text-muted-foreground mb-4 text-sm md:text-base">
                {fullAddress}
              </p>
              <LocationMapPreview location={place.location} />
            </div>

            {/* Contact */}
            {(place.phone || place.whatsapp || place.website_url) && (
              <div className="bg-card text-card-foreground p-4 md:p-6 rounded-xl shadow-sm space-y-3">
                <h3 className="text-lg font-medium">Contact</h3>

                {place.phone && (
                  <a
                    href={`tel:${place.phone}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <FiPhone /> {place.phone}
                  </a>
                )}

                {place.whatsapp && (
                  <a
                    href={`https://wa.me/${place.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <IoLogoWhatsapp /> {place.whatsapp}
                  </a>
                )}

                {place.website_url && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FiGlobe className="shrink-0" />
                    <PlaceWebsiteLink
                      placeId={place.id}
                      websiteUrl={place.website_url}
                      className="hover:text-foreground hover:underline transition-colors truncate"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="mb-10">
          <h2 className="font-medium text-lg mb-3">Upcoming Events</h2>
          {upcomingEvents.length > 0 ? (
            <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-3">
              {upcomingEvents.map((event, index) => (
                <EventCard key={event.id} {...event} priority={index < 4} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No upcoming events here.
            </p>
          )}
        </div>

        {/* Similar Places */}
        {similarPlaces.length > 0 && (
          <div>
            <h2 className="font-medium text-lg mb-3">Similar Places</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-3">
              {similarPlaces.map((similarPlace, index) => (
                <PlaceCard
                  key={similarPlace.id}
                  {...similarPlace}
                  priority={index < 3}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
