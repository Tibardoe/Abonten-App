// Distance display in the unit the viewer expects. The database and every
// service keep metres; only the last step chooses kilometres or miles.

export type DistanceUnit = "km" | "mi";

const METRES_PER_MILE = 1609.344;

/** Countries that measure road distance in miles. */
const MILE_COUNTRIES = new Set(["US", "GB", "LR", "MM"]);

export function defaultDistanceUnit(
  countryCode: string | null | undefined,
): DistanceUnit {
  return countryCode && MILE_COUNTRIES.has(countryCode.toUpperCase())
    ? "mi"
    : "km";
}

export function metresToUnit(metres: number, unit: DistanceUnit): number {
  return unit === "mi" ? metres / METRES_PER_MILE : metres / 1000;
}

export function unitToMetres(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value * METRES_PER_MILE : value * 1000;
}

/**
 * "850 m" / "2.4 km" / "0.5 mi" / "12 mi". Under a kilometre (or a tenth of
 * a mile) shows metres or yards-free "0.1 mi"; one decimal below ten units,
 * whole numbers above.
 */
export function formatDistance(
  metres: number,
  unit: DistanceUnit = "km",
  locale = "en-GB",
): string {
  if (!Number.isFinite(metres) || metres < 0) return "";
  const nf = (digits: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  if (unit === "km") {
    if (metres < 1000) return `${nf(0).format(Math.round(metres))} m`;
    const km = metres / 1000;
    return `${nf(km < 10 ? 1 : 0).format(km)} km`;
  }
  const mi = metres / METRES_PER_MILE;
  if (mi < 0.1) return `${nf(0).format(Math.round(metres * 1.09361))} yd`;
  return `${nf(mi < 10 ? 1 : 0).format(mi)} mi`;
}

/** The radius chips for filters, in the viewer's unit: 1..10 km or 1..6 mi. */
export function radiusOptions(
  unit: DistanceUnit,
): { label: string; metres: number }[] {
  const steps =
    unit === "km" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6];
  return steps.map((n) => ({
    label: `Up to ${n} ${unit}`,
    metres: Math.round(unitToMetres(n, unit)),
  }));
}
