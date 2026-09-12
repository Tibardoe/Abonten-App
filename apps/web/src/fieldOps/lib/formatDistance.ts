/**
 * A check-in distance the way a person would say it. Rounding everything to
 * kilometres turns a 40 m walk into "0 km", which reads as "no position
 * recorded" rather than "standing right there".
 */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${Math.round(metres / 100) / 10} km`;
}
