import type { Database } from "./database.types";

// Place rows as the owner-facing lists and pages select them: the table row
// plus the embedded category (and, for favourites, opening hours). The
// discovery RPCs return the flattened `PlaceType` instead.

type Tables = Database["public"]["Tables"];

export type PlaceCategoryEmbed = { name: string; slug: string };

/** `place.*, place_category(name, slug)` — organizer / profile place lists. */
export type OrganizerPlaceRow = Tables["place"]["Row"] & {
  place_category: PlaceCategoryEmbed | null;
};

/** `place.*, place_category(id, name, slug)` — the owner's management page. */
export type ManagedPlaceRow = Tables["place"]["Row"] & {
  place_category: (PlaceCategoryEmbed & { id: number }) | null;
};

/** `favorite_place.*, place(*, place_category, place_opening_hours)`. */
export type FavoritePlaceJoinRow = Tables["favorite_place"]["Row"] & {
  place:
    | (Tables["place"]["Row"] & {
        place_category: PlaceCategoryEmbed | null;
        place_opening_hours: {
          day_of_week: number;
          open_time: string | null;
          close_time: string | null;
          is_closed: boolean;
        }[];
      })
    | null;
};
