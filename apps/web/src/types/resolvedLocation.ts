// A location that has actually been resolved to real coordinates, whether
// via an autocomplete selection, "use my current location", or resolving
// manually typed text/coordinates at submit time. Previously duplicated as
// an inline object literal type in usePlacesAutocomplete.ts, AutoComplete.tsx,
// PostAutoComplete.tsx, and MapPicker.tsx.
export type ResolvedLocation = {
  lat: number;
  lng: number;
  address: string;
};
