// ISO 4217 currencies Abonten can price, charge, settle or display in.
//
// `minorUnits` is the ISO exponent — how many decimal places the currency's
// smallest unit has. Most currencies have 2 (GHS pesewas, NGN kobo, GBP
// pence), several have 0 (XOF, JPY, RWF, UGX) and a few have 3 (KWD, BHD).
// Every conversion between "major" amounts (what a person types and what
// the numeric columns store) and "minor" amounts (what the money model and
// the payment providers count in) reads the exponent from this table; the
// old `toPesewas` (always ×100) is gone.
//
// `symbol` is the sign shown before the amount ("GH₵50", "₦25,000", "£20").
// It is deliberately our own table rather than Intl's: Hermes on Android
// does not support `currencyDisplay: "narrowSymbol"`, and Intl's symbols
// differ by locale ("GH₵" vs "GHS" vs "₵"), so formatting would drift between
// web and app and between test runs. `symbolIsAmbiguous` marks signs that
// several currencies share ($) — formatMoney adds the code when the viewer's
// own currency is a different one with the same sign.
//
// Adding a currency here does not make it usable: a market must list it in
// `supported_currencies` and a provider must accept it.

export type CurrencyCode = string;

export type Currency = {
  code: CurrencyCode;
  name: string;
  minorUnits: 0 | 2 | 3;
  symbol: string;
  symbolIsAmbiguous?: boolean;
};

const LIST: readonly Currency[] = [
  { code: "GHS", name: "Ghanaian cedi", minorUnits: 2, symbol: "GH₵" },
  { code: "NGN", name: "Nigerian naira", minorUnits: 2, symbol: "₦" },
  { code: "KES", name: "Kenyan shilling", minorUnits: 2, symbol: "KSh" },
  { code: "ZAR", name: "South African rand", minorUnits: 2, symbol: "R" },
  { code: "XOF", name: "West African CFA franc", minorUnits: 0, symbol: "CFA" },
  {
    code: "XAF",
    name: "Central African CFA franc",
    minorUnits: 0,
    symbol: "FCFA",
  },
  {
    code: "USD",
    name: "US dollar",
    minorUnits: 2,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  { code: "GBP", name: "British pound", minorUnits: 2, symbol: "£" },
  { code: "EUR", name: "Euro", minorUnits: 2, symbol: "€" },
  {
    code: "CAD",
    name: "Canadian dollar",
    minorUnits: 2,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  {
    code: "AUD",
    name: "Australian dollar",
    minorUnits: 2,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  {
    code: "NZD",
    name: "New Zealand dollar",
    minorUnits: 2,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  { code: "RWF", name: "Rwandan franc", minorUnits: 0, symbol: "RF" },
  { code: "UGX", name: "Ugandan shilling", minorUnits: 0, symbol: "USh" },
  { code: "TZS", name: "Tanzanian shilling", minorUnits: 2, symbol: "TSh" },
  { code: "ETB", name: "Ethiopian birr", minorUnits: 2, symbol: "Br" },
  { code: "EGP", name: "Egyptian pound", minorUnits: 2, symbol: "E£" },
  { code: "MAD", name: "Moroccan dirham", minorUnits: 2, symbol: "MAD" },
  { code: "TND", name: "Tunisian dinar", minorUnits: 3, symbol: "DT" },
  { code: "DZD", name: "Algerian dinar", minorUnits: 2, symbol: "DA" },
  { code: "SLE", name: "Sierra Leonean leone", minorUnits: 2, symbol: "Le" },
  { code: "LRD", name: "Liberian dollar", minorUnits: 2, symbol: "L$" },
  { code: "GMD", name: "Gambian dalasi", minorUnits: 2, symbol: "D" },
  { code: "CVE", name: "Cape Verdean escudo", minorUnits: 2, symbol: "Esc" },
  { code: "BWP", name: "Botswana pula", minorUnits: 2, symbol: "P" },
  { code: "ZMW", name: "Zambian kwacha", minorUnits: 2, symbol: "ZK" },
  { code: "MWK", name: "Malawian kwacha", minorUnits: 2, symbol: "MK" },
  { code: "MZN", name: "Mozambican metical", minorUnits: 2, symbol: "MT" },
  { code: "NAD", name: "Namibian dollar", minorUnits: 2, symbol: "N$" },
  { code: "AOA", name: "Angolan kwanza", minorUnits: 2, symbol: "Kz" },
  { code: "CDF", name: "Congolese franc", minorUnits: 2, symbol: "FC" },
  { code: "MUR", name: "Mauritian rupee", minorUnits: 2, symbol: "Rs" },
  { code: "SCR", name: "Seychellois rupee", minorUnits: 2, symbol: "SR" },
  { code: "MGA", name: "Malagasy ariary", minorUnits: 2, symbol: "Ar" },
  { code: "BIF", name: "Burundian franc", minorUnits: 0, symbol: "FBu" },
  { code: "DJF", name: "Djiboutian franc", minorUnits: 0, symbol: "Fdj" },
  { code: "SDG", name: "Sudanese pound", minorUnits: 2, symbol: "SDG" },
  { code: "SSP", name: "South Sudanese pound", minorUnits: 2, symbol: "SSP" },
  { code: "SOS", name: "Somali shilling", minorUnits: 2, symbol: "Sh.So." },
  { code: "ERN", name: "Eritrean nakfa", minorUnits: 2, symbol: "Nfk" },
  { code: "LSL", name: "Lesotho loti", minorUnits: 2, symbol: "L" },
  { code: "SZL", name: "Swazi lilangeni", minorUnits: 2, symbol: "E" },
  { code: "MRU", name: "Mauritanian ouguiya", minorUnits: 2, symbol: "UM" },
  { code: "GNF", name: "Guinean franc", minorUnits: 0, symbol: "FG" },
  { code: "LYD", name: "Libyan dinar", minorUnits: 3, symbol: "LD" },
  {
    code: "STN",
    name: "São Tomé and Príncipe dobra",
    minorUnits: 2,
    symbol: "Db",
  },
  { code: "KMF", name: "Comorian franc", minorUnits: 0, symbol: "CF" },
  { code: "AED", name: "UAE dirham", minorUnits: 2, symbol: "AED" },
  { code: "SAR", name: "Saudi riyal", minorUnits: 2, symbol: "SR" },
  { code: "QAR", name: "Qatari riyal", minorUnits: 2, symbol: "QR" },
  { code: "KWD", name: "Kuwaiti dinar", minorUnits: 3, symbol: "KD" },
  { code: "BHD", name: "Bahraini dinar", minorUnits: 3, symbol: "BD" },
  { code: "OMR", name: "Omani rial", minorUnits: 3, symbol: "RO" },
  { code: "JOD", name: "Jordanian dinar", minorUnits: 3, symbol: "JD" },
  { code: "INR", name: "Indian rupee", minorUnits: 2, symbol: "₹" },
  { code: "PKR", name: "Pakistani rupee", minorUnits: 2, symbol: "Rs" },
  { code: "BDT", name: "Bangladeshi taka", minorUnits: 2, symbol: "৳" },
  { code: "LKR", name: "Sri Lankan rupee", minorUnits: 2, symbol: "Rs" },
  { code: "JPY", name: "Japanese yen", minorUnits: 0, symbol: "¥" },
  { code: "CNY", name: "Chinese yuan", minorUnits: 2, symbol: "CN¥" },
  { code: "HKD", name: "Hong Kong dollar", minorUnits: 2, symbol: "HK$" },
  { code: "SGD", name: "Singapore dollar", minorUnits: 2, symbol: "S$" },
  { code: "MYR", name: "Malaysian ringgit", minorUnits: 2, symbol: "RM" },
  { code: "IDR", name: "Indonesian rupiah", minorUnits: 2, symbol: "Rp" },
  { code: "PHP", name: "Philippine peso", minorUnits: 2, symbol: "₱" },
  { code: "THB", name: "Thai baht", minorUnits: 2, symbol: "฿" },
  { code: "VND", name: "Vietnamese dong", minorUnits: 0, symbol: "₫" },
  { code: "KRW", name: "South Korean won", minorUnits: 0, symbol: "₩" },
  { code: "TRY", name: "Turkish lira", minorUnits: 2, symbol: "₺" },
  { code: "ILS", name: "Israeli new shekel", minorUnits: 2, symbol: "₪" },
  { code: "CHF", name: "Swiss franc", minorUnits: 2, symbol: "CHF" },
  { code: "SEK", name: "Swedish krona", minorUnits: 2, symbol: "kr" },
  { code: "NOK", name: "Norwegian krone", minorUnits: 2, symbol: "kr" },
  { code: "DKK", name: "Danish krone", minorUnits: 2, symbol: "kr" },
  { code: "ISK", name: "Icelandic króna", minorUnits: 0, symbol: "kr" },
  { code: "PLN", name: "Polish złoty", minorUnits: 2, symbol: "zł" },
  { code: "CZK", name: "Czech koruna", minorUnits: 2, symbol: "Kč" },
  { code: "HUF", name: "Hungarian forint", minorUnits: 2, symbol: "Ft" },
  { code: "RON", name: "Romanian leu", minorUnits: 2, symbol: "lei" },
  { code: "BGN", name: "Bulgarian lev", minorUnits: 2, symbol: "лв" },
  { code: "UAH", name: "Ukrainian hryvnia", minorUnits: 2, symbol: "₴" },
  { code: "RUB", name: "Russian ruble", minorUnits: 2, symbol: "₽" },
  { code: "BRL", name: "Brazilian real", minorUnits: 2, symbol: "R$" },
  {
    code: "MXN",
    name: "Mexican peso",
    minorUnits: 2,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  {
    code: "ARS",
    name: "Argentine peso",
    minorUnits: 2,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  {
    code: "CLP",
    name: "Chilean peso",
    minorUnits: 0,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  {
    code: "COP",
    name: "Colombian peso",
    minorUnits: 2,
    symbol: "$",
    symbolIsAmbiguous: true,
  },
  { code: "PEN", name: "Peruvian sol", minorUnits: 2, symbol: "S/" },
  { code: "JMD", name: "Jamaican dollar", minorUnits: 2, symbol: "J$" },
  {
    code: "TTD",
    name: "Trinidad and Tobago dollar",
    minorUnits: 2,
    symbol: "TT$",
  },
];

const BY_CODE: ReadonlyMap<string, Currency> = new Map(
  LIST.map((c) => [c.code, c]),
);

export const CURRENCIES: readonly Currency[] = LIST;

export function isKnownCurrency(code: unknown): code is CurrencyCode {
  return typeof code === "string" && BY_CODE.has(code.toUpperCase());
}

/** Throws for a code this table does not know — a bug, never user input. */
export function getCurrency(code: CurrencyCode): Currency {
  const c = BY_CODE.get(code.toUpperCase());
  if (!c) throw new Error(`Unknown currency: ${code}`);
  return c;
}

export function findCurrency(code: unknown): Currency | null {
  return typeof code === "string"
    ? (BY_CODE.get(code.toUpperCase()) ?? null)
    : null;
}

/** ISO 4217 exponent: 2 for GHS/USD/GBP, 0 for XOF/JPY, 3 for KWD. */
export function currencyMinorUnits(code: CurrencyCode): number {
  return getCurrency(code).minorUnits;
}

/** 10^exponent: 100 for GHS, 1 for XOF, 1000 for KWD. */
export function currencyMinorFactor(code: CurrencyCode): number {
  return 10 ** getCurrency(code).minorUnits;
}

/** Normalises user/provider input ("ghs ", "GHS") to the canonical code. */
export function normalizeCurrencyCode(code: string): CurrencyCode {
  return getCurrency(code.trim()).code;
}
