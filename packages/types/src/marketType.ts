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
  /**
   * Open here, or coming soon (Explore says so and offers the waiting
   * list). Absent in answers cached before 2026-09-30: launched.
   */
  launchStatus?: "launched" | "coming_soon";
  position: number;
  /** Upcoming events and places in the radius (launched cities only). */
  activity?: { upcomingEvents: number; places: number } | null;
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
  /** Customer-paid service fee rate (0.05 = 5%) in the market currency, for previews. */
  serviceFeeRate?: number | null;
  centre: { lat: number; lng: number } | null;
  /** Sizes the price filters for this currency (1 = cedi-sized). */
  priceScale?: number;
  /**
   * What a point outside every listed city is: open (`everywhere`) or not
   * launched yet. Absent in answers cached before 2026-09-30: everywhere.
   */
  coverageMode?: "everywhere" | "launched_areas";
  /**
   * Which launched cities Explore offers from a not-launched area. Absent
   * in answers cached before the setting existed: let people choose.
   */
  browseFallback?: {
    strategy: "choose" | "nearest" | "most_active" | "fixed";
    regionId: string | null;
    limit: number;
  };
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

/** Whether the signed-in person is on the waiting list for an area. */
export type AreaWaitlistStatus = {
  waiting: boolean;
  /** The area's name as the list records it ("Kumasi"), when waiting. */
  areaName: string | null;
};

export type AreaWaitlistJoinBody = {
  lat: number;
  lng: number;
  /** What the person sees as the area's name, for areas outside every city. */
  label?: string | null;
};
