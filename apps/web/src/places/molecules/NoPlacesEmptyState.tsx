"use client";

import ChangeLocationModal from "@/components/organisms/ChangeLocationModal";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { IoStorefrontOutline } from "react-icons/io5";

// "All Places" empty state for the Explore page's Places tab. Owns its own
// modal state the same way
// src/components/organisms/LocationAndFilterSection.tsx does, rather than
// threading a shared open/close handler down through InfiniteList's
// emptyState prop. Drawn like the Events tab's empty state (NoEventsFound)
// so the two tabs look like one page.
export default function NoPlacesEmptyState() {
  const t = useTranslations("places");

  const [showChangeLocationModal, setShowChangeLocationModal] = useState(false);

  const handleShowChangeLocationModal = (state: boolean) => {
    setShowChangeLocationModal(state);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] py-10 px-4 text-center gap-4">
      {showChangeLocationModal && (
        <ChangeLocationModal
          handleShowChangeLocationModal={handleShowChangeLocationModal}
        />
      )}

      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
        <IoStorefrontOutline
          aria-hidden
          className="text-3xl text-muted-foreground"
        />
      </div>

      <div className="max-w-sm space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">
          {t("noPlacesFound")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("nothingListedHereMatchesYetTry")}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowChangeLocationModal(true)}
        className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t("changeLocation")}
      </button>
    </div>
  );
}
