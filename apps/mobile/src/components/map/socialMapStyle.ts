// Google map styles for the social map (Android; iOS draws Apple Maps and
// takes `userInterfaceStyle` + `showsPointsOfInterests` instead).
//
// Both hide Google's own shop, restaurant and transit pins: on a map whose
// markers ARE events and places, a second set of businesses competes with
// them and reads as "these are on Abonten too". Roads, areas and water
// stay, so people can still tell where things are. The dark style is built
// from the app's dark palette (background 222 18% 9%) so the map does not
// sit as a bright slab inside a dark screen.

type MapStyle = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
}[];

const HIDE_OTHER_PINS: MapStyle = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  {
    featureType: "transit",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

export const LIGHT_MAP_STYLE: MapStyle = [
  // A touch less saturated than stock Google, so the photo markers carry
  // the colour.
  { stylers: [{ saturation: -25 }] },
  ...HIDE_OTHER_PINS,
];

export const DARK_MAP_STYLE: MapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1e25" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8c94a3" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#13161b" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#353b46" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#b9c0cc" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#17251f" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#282d36" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1d2128" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9aa2b0" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#343a45" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f232a" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#232831" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e1a24" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4f6b79" }],
  },
  ...HIDE_OTHER_PINS,
];
