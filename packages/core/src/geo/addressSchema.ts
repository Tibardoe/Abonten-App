// Which address fields a country's form shows, what they are called and
// which are required — the shape Google's libaddressinput publishes, kept
// to the fields Abonten actually captures. `default` covers any country
// without an entry. A market can override this in its `address_schema`
// column; this file is the built-in fallback.

export type AddressFieldKey =
  | "street"
  | "district"
  | "city"
  | "region"
  | "postal_code";

export type AddressFieldRule = {
  key: AddressFieldKey;
  label: string;
  required: boolean;
  /** Validation for the value, when the country has a fixed format. */
  pattern?: string;
  example?: string;
};

export type AddressSchema = {
  fields: AddressFieldRule[];
};

const street = (required = false): AddressFieldRule => ({
  key: "street",
  label: "Street address",
  required,
});
const district = (label = "Neighbourhood"): AddressFieldRule => ({
  key: "district",
  label,
  required: false,
});
const city = (label = "City", required = true): AddressFieldRule => ({
  key: "city",
  label,
  required,
});
const region = (label: string, required = false): AddressFieldRule => ({
  key: "region",
  label,
  required,
});
const postal = (
  label: string,
  required: boolean,
  pattern?: string,
  example?: string,
): AddressFieldRule => ({
  key: "postal_code",
  label,
  required,
  pattern,
  example,
});

export const DEFAULT_ADDRESS_SCHEMA: AddressSchema = {
  fields: [
    street(),
    district(),
    city(),
    region("Region"),
    postal("Postal code", false),
  ],
};

export const ADDRESS_SCHEMAS: Readonly<Record<string, AddressSchema>> = {
  GH: {
    fields: [
      street(),
      district("Area / suburb"),
      city("Town / city"),
      region("Region"),
      postal(
        "Digital address (GhanaPostGPS)",
        false,
        "^[A-Z]{2}-\\d{3,4}-\\d{4}$",
        "GA-184-2345",
      ),
    ],
  },
  NG: {
    fields: [
      street(),
      district("Area"),
      city("City"),
      region("State", true),
      postal("Postal code", false, "^\\d{6}$", "100001"),
    ],
  },
  KE: {
    fields: [
      street(),
      district("Estate / area"),
      city("Town"),
      region("County"),
      postal("Postal code", false, "^\\d{5}$", "00100"),
    ],
  },
  ZA: {
    fields: [
      street(),
      district("Suburb"),
      city("City"),
      region("Province", true),
      postal("Postal code", true, "^\\d{4}$", "2000"),
    ],
  },
  CI: {
    fields: [
      street(),
      district("Quartier"),
      city("Ville"),
      region("Région"),
      postal("Code postal", false),
    ],
  },
  GB: {
    fields: [
      street(true),
      district("Area"),
      city("Town / city"),
      region("County"),
      postal(
        "Postcode",
        true,
        "^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$",
        "SW1A 1AA",
      ),
    ],
  },
  IE: {
    fields: [
      street(true),
      district("Area"),
      city("Town / city"),
      region("County", true),
      postal("Eircode", true, "^[A-Z\\d]{3} ?[A-Z\\d]{4}$", "D02 X285"),
    ],
  },
  US: {
    fields: [
      street(true),
      district("Neighborhood"),
      city("City"),
      region("State", true),
      postal("ZIP code", true, "^\\d{5}(-\\d{4})?$", "94103"),
    ],
  },
  CA: {
    fields: [
      street(true),
      district("Neighbourhood"),
      city("City"),
      region("Province", true),
      postal("Postal code", true, "^[A-Z]\\d[A-Z] ?\\d[A-Z]\\d$", "M5V 3L9"),
    ],
  },
  FR: {
    fields: [
      street(true),
      district("Quartier"),
      city("Ville"),
      region("Région"),
      postal("Code postal", true, "^\\d{5}$", "75001"),
    ],
  },
  DE: {
    fields: [
      street(true),
      district("Stadtteil"),
      city("Stadt"),
      region("Bundesland"),
      postal("PLZ", true, "^\\d{5}$", "10115"),
    ],
  },
  NL: {
    fields: [
      street(true),
      district("Wijk"),
      city("Plaats"),
      region("Provincie"),
      postal("Postcode", true, "^\\d{4} ?[A-Z]{2}$", "1012 AB"),
    ],
  },
  ES: {
    fields: [
      street(true),
      district("Barrio"),
      city("Ciudad"),
      region("Provincia"),
      postal("Código postal", true, "^\\d{5}$", "28001"),
    ],
  },
  IT: {
    fields: [
      street(true),
      district("Quartiere"),
      city("Città"),
      region("Provincia"),
      postal("CAP", true, "^\\d{5}$", "00100"),
    ],
  },
  PT: {
    fields: [
      street(true),
      district("Bairro"),
      city("Cidade"),
      region("Distrito"),
      postal("Código postal", true, "^\\d{4}-\\d{3}$", "1000-001"),
    ],
  },
  AE: {
    fields: [street(), district("Area"), city("City"), region("Emirate", true)],
  },
  IN: {
    fields: [
      street(true),
      district("Locality"),
      city("City"),
      region("State", true),
      postal("PIN code", true, "^\\d{6}$", "110001"),
    ],
  },
  AU: {
    fields: [
      street(true),
      district("Suburb"),
      city("City"),
      region("State", true),
      postal("Postcode", true, "^\\d{4}$", "2000"),
    ],
  },
  RW: {
    fields: [
      street(),
      district("Sector"),
      city("District"),
      region("Province"),
    ],
  },
  UG: {
    fields: [
      street(),
      district("Division"),
      city("City / town"),
      region("District"),
    ],
  },
  TZ: {
    fields: [street(), district("Ward"), city("City / town"), region("Region")],
  },
  SN: {
    fields: [street(), district("Quartier"), city("Ville"), region("Région")],
  },
};

export function addressSchemaFor(
  countryCode: string | null | undefined,
): AddressSchema {
  if (!countryCode) return DEFAULT_ADDRESS_SCHEMA;
  return ADDRESS_SCHEMAS[countryCode.toUpperCase()] ?? DEFAULT_ADDRESS_SCHEMA;
}

export type AddressValidationIssue = { key: AddressFieldKey; message: string };

/** Checks an address against its country's rules; empty means valid. */
export function validateAddress(
  address: Record<string, string | null | undefined>,
  schema: AddressSchema,
): AddressValidationIssue[] {
  const issues: AddressValidationIssue[] = [];
  for (const f of schema.fields) {
    const value = (address[f.key] ?? "").trim();
    if (!value) {
      if (f.required)
        issues.push({ key: f.key, message: `${f.label} is required.` });
      continue;
    }
    if (f.pattern && !new RegExp(f.pattern, "i").test(value)) {
      issues.push({
        key: f.key,
        message: f.example
          ? `Enter a valid ${f.label.toLowerCase()} (e.g. ${f.example}).`
          : `Enter a valid ${f.label.toLowerCase()}.`,
      });
    }
  }
  return issues;
}
