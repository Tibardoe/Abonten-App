// The curated supported-country list now lives in @abonten/core/countries so
// the mobile auth country picker and the web PhoneInput share one source of
// truth. This module stays as the web import path.
export {
  countries as countryDetails,
  type Country,
} from "@abonten/core/countries";
