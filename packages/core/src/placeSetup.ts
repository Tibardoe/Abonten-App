// "Is this place profile finished?" — the model behind the place-owner
// setup checklist on web and mobile. Same shape as profileCompletion.ts, so
// the two checklists look and behave alike.
//
// Deliberately NOT a percentage. Name, description, category, location and
// a cover photo are NOT NULL in the `place` table, so every place starts
// with the basics already done — a percent would sit near the top for
// everyone and tell the owner nothing. A short "3 of 5 done" list of the
// things that are genuinely optional is honest and actionable.

import type { VerificationStatus } from "@abonten/types/verificationType";
import type { CoreTranslator } from "./i18n/translator";

export type PlaceSetupItemKey =
  | "photos"
  | "hours"
  | "contact"
  | "services"
  | "verification";

export type PlaceSetupItem = {
  key: PlaceSetupItemKey;
  /** Key under the core namespace; render with placeSetupItemLabel. */
  labelKey: string;
  complete: boolean;
  /** Which tab of the manage screen this item lives on. */
  tab: "photos" | "hours" | "details" | "services" | "verification";
  /** Status pill for the verification row; null for the plain rows. */
  statusLabel?: string | null;
};

export type PlaceSetup = {
  items: PlaceSetupItem[];
  completedCount: number;
  total: number;
  isComplete: boolean;
};

export type PlaceSetupInput = {
  photoCount: number;
  hasOpeningHours: boolean;
  /** Any one of phone, WhatsApp or website counts. */
  hasContact: boolean;
  serviceCount: number;
  /** Null when no verification case exists yet. */
  verificationStatus: VerificationStatus | null | undefined;
  /** False when the programme is switched off — the row is then hidden. */
  verificationAvailable: boolean;
};

/** Three photos is the point where a listing stops looking empty. */
export const PLACE_SETUP_MIN_PHOTOS = 3;

/** "Add at least 3 photos" — the item's words in the reader's language. */
export function placeSetupItemLabel(
  t: CoreTranslator,
  item: Pick<PlaceSetupItem, "labelKey">,
): string {
  return t(item.labelKey, { count: PLACE_SETUP_MIN_PHOTOS });
}

export function computePlaceSetup(input: PlaceSetupInput): PlaceSetup {
  const items: PlaceSetupItem[] = [
    {
      key: "photos",
      labelKey: "placeSetup.photos",
      complete: input.photoCount >= PLACE_SETUP_MIN_PHOTOS,
      tab: "photos",
    },
    {
      key: "hours",
      labelKey: "placeSetup.hours",
      complete: input.hasOpeningHours,
      tab: "hours",
    },
    {
      key: "contact",
      labelKey: "placeSetup.contact",
      complete: input.hasContact,
      tab: "details",
    },
    {
      key: "services",
      labelKey: "placeSetup.services",
      complete: input.serviceCount > 0,
      tab: "services",
    },
  ];

  // The verification row only appears when the programme is open to this
  // owner, or when they already have a verification to show.
  if (input.verificationAvailable || input.verificationStatus) {
    items.push({
      key: "verification",
      labelKey: "placeSetup.verification",
      complete: input.verificationStatus === "approved",
      tab: "verification",
      statusLabel: input.verificationStatus ?? null,
    });
  }

  const completedCount = items.filter((i) => i.complete).length;
  return {
    items,
    completedCount,
    total: items.length,
    isComplete: completedCount === items.length,
  };
}
