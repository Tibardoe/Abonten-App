"use client";

import EventUploadModal from "@/components/organisms/EventUploadModal";
import { useImageSelection } from "@/hooks/useImageSelection";
import ManagePlaceBookingsSection from "@/places/organisms/ManagePlaceBookingsSection";
import ManagePlaceDetailsSection from "@/places/organisms/ManagePlaceDetailsSection";
import ManagePlaceHoursSection from "@/places/organisms/ManagePlaceHoursSection";
import ManagePlaceInsightsSection from "@/places/organisms/ManagePlaceInsightsSection";
import ManagePlacePhotosSection from "@/places/organisms/ManagePlacePhotosSection";
import ManagePlacePromotionSection from "@/places/organisms/ManagePlacePromotionSection";
import ManagePlaceReviewsSection from "@/places/organisms/ManagePlaceReviewsSection";
import ManagePlaceServicesSection from "@/places/organisms/ManagePlaceServicesSection";
import type { PaginatedResult } from "@/types/pagination";
import type {
  BookingStatus,
  OwnerPlaceBooking,
} from "@/types/placeBookingType";
import type { PlacePromotionTier } from "@/types/placeType";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IoAddOutline } from "react-icons/io5";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) -- same convention every other Places component uses for a joined/raw row
type ManagedPlace = any;
// biome-ignore lint/suspicious/noExplicitAny: see above
type PlaceReviewRow = any;

type ManagePlaceViewProps = {
  place: ManagedPlace;
  openingHours: {
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    is_closed: boolean;
  }[];
  services: {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    price_unit: string | null;
    show_price: boolean;
  }[];
  photos: {
    id: string;
    public_id: string;
    version: string;
    position: number;
  }[];
  reviewsFirstPage: PaginatedResult<PlaceReviewRow>;
  fetchReviewsPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<PlaceReviewRow>>;
  bookingsFirstPage: PaginatedResult<OwnerPlaceBooking>;
  fetchBookingsPage: (
    status: BookingStatus | undefined,
    cursor: string | null,
  ) => Promise<PaginatedResult<OwnerPlaceBooking>>;
  insights: Record<string, number>;
  insightsError: boolean;
  promotionTiers: PlacePromotionTier[];
  currentPromotion: { ends_at: string; tier_label: string | null } | null;
};

type Tab =
  | "details"
  | "photos"
  | "hours"
  | "services"
  | "bookings"
  | "reviews"
  | "insights"
  | "promotion";

const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details & Location" },
  { id: "photos", label: "Photos" },
  { id: "hours", label: "Hours & Status" },
  { id: "services", label: "Services" },
  { id: "bookings", label: "Bookings" },
  { id: "reviews", label: "Reviews" },
  { id: "insights", label: "Insights" },
  { id: "promotion", label: "Promotion" },
];

// Top-level management view for a single place, tabbed across the sections
// the milestone spec calls for. Each section owns its own save action;
// `refresh` (router.refresh()) is passed down as the shared "something
// changed, re-fetch this Server Component's data" callback, same technique
// EditEventModal.tsx's onSuccess already uses.
export default function ManagePlaceView({
  place,
  openingHours,
  services,
  photos,
  reviewsFirstPage,
  fetchReviewsPage,
  bookingsFirstPage,
  fetchBookingsPage,
  insights,
  insightsError,
  promotionTiers,
  currentPromotion,
}: ManagePlaceViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [showEventModal, setShowEventModal] = useState(false);

  const refresh = () => router.refresh();

  const placeAddress =
    (place.address as { full_address?: string })?.full_address ?? "";

  // "+ Add Upcoming Event" needs a flyer picked before EventUploadModal can
  // mount (it requires imgUrl/selectedFile up front -- same constraint
  // Header.tsx/SideBar.tsx's own event-create trigger works around), so
  // this reuses the exact same useImageSelection + hidden-input pattern
  // rather than changing EventUploadModal's own step-1 assumptions.
  const { imagePreview, selectedFile, fileInputRef, handleFileChange } =
    useImageSelection({
      invalidFileMessage: "Please select an image file for your event flyer.",
      onInvalidFile: (message) => alert(message),
      onSelect: () => setShowEventModal(true),
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-bold md:text-xl">{place.name}</h1>
          <p className="text-sm text-muted-foreground">{placeAddress}</p>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <IoAddOutline className="text-lg" />
          Add Upcoming Event
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileChange}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-px md:justify-center">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-3 py-2 text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="w-full md:w-[70%] md:mx-auto">
        {activeTab === "details" && (
          <ManagePlaceDetailsSection place={place} onSaved={refresh} />
        )}

        {activeTab === "photos" && (
          <ManagePlacePhotosSection
            placeId={place.id}
            photos={photos}
            onChanged={refresh}
          />
        )}

        {activeTab === "hours" && (
          <ManagePlaceHoursSection
            placeId={place.id}
            openingHours={openingHours}
            temporaryStatus={place.temporary_status}
            temporaryStatusNote={place.temporary_status_note}
            onChanged={refresh}
          />
        )}

        {activeTab === "services" && (
          <ManagePlaceServicesSection
            placeId={place.id}
            services={services}
            onChanged={refresh}
          />
        )}

        {activeTab === "bookings" && (
          <ManagePlaceBookingsSection
            placeId={place.id}
            initialPage={bookingsFirstPage}
            fetchPage={fetchBookingsPage}
          />
        )}

        {activeTab === "reviews" && (
          <ManagePlaceReviewsSection
            placeId={place.id}
            initialPage={reviewsFirstPage}
            fetchPage={fetchReviewsPage}
          />
        )}

        {activeTab === "insights" && (
          <ManagePlaceInsightsSection
            insights={insights}
            isError={insightsError}
            onRetry={refresh}
          />
        )}

        {activeTab === "promotion" && (
          <ManagePlacePromotionSection
            placeId={place.id}
            tiers={promotionTiers}
            currentPromotion={currentPromotion}
          />
        )}
      </div>

      {showEventModal && imagePreview && selectedFile && (
        <EventUploadModal
          handleClosePopup={setShowEventModal}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
          onUploadSuccess={refresh}
          preselectedPlaceId={place.id}
          preselectedPlaceAddress={placeAddress}
          preselectedPlaceName={place.name}
        />
      )}
    </div>
  );
}
