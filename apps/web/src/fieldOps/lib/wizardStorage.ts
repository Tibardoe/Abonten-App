import type { PlaceOpeningHoursInput } from "@abonten/types/placeType";

// The onboarding wizard keeps its half-typed form in sessionStorage keyed
// by onboarding id, so a dropped connection or a phone that reloads the
// tab in the field never loses the member's work. Only form text lives
// here; photos are uploaded as they are picked and referenced by id.

export type WizardPhoto = { publicId: string; version: string; url: string };

export type WizardState = {
  step: number;
  name: string;
  location: { lat: number; lng: number } | null;
  locationAccuracyM: number | null;
  duplicateAcknowledged: boolean;
  /** Set when the member chose to help the owner claim an existing listing
   *  instead of creating a second one. */
  claimPlaceId: string | null;
  claimPlaceName: string | null;
  ownerFullName: string;
  ownerPhone: string;
  categoryId: number | null;
  description: string;
  address: string;
  phone: string;
  whatsapp: string;
  websiteUrl: string;
  openingHours: PlaceOpeningHoursInput[];
  cover: WizardPhoto | null;
  photos: WizardPhoto[];
};

export const DEFAULT_HOURS: PlaceOpeningHoursInput[] = [
  0, 1, 2, 3, 4, 5, 6,
].map((dayOfWeek) => ({
  dayOfWeek,
  openTime: "08:00",
  closeTime: "18:00",
  isClosed: dayOfWeek === 0,
}));

export function emptyWizardState(seed: {
  name?: string | null;
  ownerFullName?: string | null;
}): WizardState {
  return {
    step: 1,
    name: seed.name ?? "",
    location: null,
    locationAccuracyM: null,
    duplicateAcknowledged: false,
    claimPlaceId: null,
    claimPlaceName: null,
    ownerFullName: seed.ownerFullName ?? "",
    ownerPhone: "",
    categoryId: null,
    description: "",
    address: "",
    phone: "",
    whatsapp: "",
    websiteUrl: "",
    openingHours: DEFAULT_HOURS,
    cover: null,
    photos: [],
  };
}

const key = (id: string) => `fieldops-onboarding:${id}`;

export function loadWizardState(id: string): WizardState | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as WizardState) : null;
  } catch {
    return null;
  }
}

export function saveWizardState(id: string, state: WizardState): void {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(state));
  } catch {
    // Storage full or blocked: the server copy is the fallback.
  }
}

export function clearWizardState(id: string): void {
  try {
    sessionStorage.removeItem(key(id));
  } catch {
    // ignore
  }
}

export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}
