import type { PlaceType } from "./placeType";

// Mirrors favoriteEventTypes.ts's FavoriteEvents shape, for favorite_place
// rows instead of favorite rows. `place` is normalized to the same PlaceType
// shape PlaceCard already expects (see getUserFavoritePlaces.ts for how
// avg_rating/review_count/is_open are computed, since the plain favorite_place
// + place join doesn't carry those the way get_nearby_places/get_filtered_places do).
export type FavoritePlaces = {
  user_id: string;
  place_id: string;
  created_at: string;
  place: PlaceType;
};
