// Wire shapes for the markets API (/api/mobile/markets/*, the web
// getMarketContext action). Plain data, mirrored by @abonten/core/market
// (which owns the logic); kept here so the API client stays free of
// business modules.

export type MarketStatus =
  | "draft"
  | "preparing"
  | "ready"
  | "live"
  | "paused"
  | "maintenance";

export type DistanceUnit = "km" | "mi";

export type PublicMarketPaymentMethod = {
  method: string;
  provider: string;
  currencies: string[];
  platforms: string[];
  recommended: boolean;
  label: string | null;
};

export type PublicMarketPayoutMethod = {
  method: "mobile_money" | "bank";
  currency: string;
  fields: {
    key: string;
    label: string;
    required: boolean;
    pattern?: string;
    example?: string;
  }[];
  label: string | null;
};

export type PublicMarketRegion = {
  id: string;
  slug: string;
  name: string;
  kind: "city" | "region";
  lat: number;
  lng: number;
  radiusKm: number;
  status: "active" | "inactive";
  position: number;
};

export type PublicMarket = {
  countryCode: string;
  name: string;
  status: MarketStatus;
  defaultCurrency: string;
  supportedCurrencies: string[];
  defaultTimeZone: string;
  defaultLocale: string;
  supportedLocales: string[];
  distanceUnit: DistanceUnit;
  dialCode: string;
  addressSchema: {
    fields: {
      key: string;
      label: string;
      required: boolean;
      pattern?: string;
      example?: string;
    }[];
  } | null;
  tax: {
    mode: "none" | "inclusive" | "exclusive";
    rateBps: number;
    label: string;
  };
  centre: { lat: number; lng: number } | null;
  paymentMethods: PublicMarketPaymentMethod[];
  payoutMethods: PublicMarketPayoutMethod[];
  regions: PublicMarketRegion[];
};

export type LocaleContext = {
  marketCountry: string;
  viewerCountry: string | null;
  displayCurrency: string;
  locale: string;
  distanceUnit: DistanceUnit;
  timeZone: string;
  source: "preference" | "browsing" | "request" | "default";
};

export type RateTable = {
  base: string;
  rates: Record<string, number>;
  asOf: string;
  source: string;
};

export type MarketContextResult = {
  markets: PublicMarket[];
  context: LocaleContext;
  rates: RateTable | null;
  flags: Record<string, boolean>;
};

export type ListingMarket = {
  ok: true;
  countryCode: string;
  countryName: string;
  currency: string;
  timeZone: string;
  marketStatus: string;
};

export type LocalePreferencesPatch = {
  countryCode?: string | null;
  displayCurrency?: string | null;
  locale?: string | null;
  distanceUnit?: DistanceUnit | null;
};

export type LocalePreferences = {
  countryCode: string | null;
  displayCurrency: string | null;
  distanceUnit: DistanceUnit | null;
  locale: string | null;
};
