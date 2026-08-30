// "Expires in Xh" / "Expires in Xm" for draft cards — deliberately coarse
// (no live countdown) since expiry is only ever checked authoritatively by
// the server on continue/list, this is just an advance-warning hint.
export function formatExpiresIn(expiresAt: string | Date): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();

  if (diffMs <= 0) return "Expired";

  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0
      ? `Expires in ${days}d ${remainingHours}h`
      : `Expires in ${days}d`;
  }

  if (hours >= 1) {
    return `Expires in ${hours}h`;
  }

  return `Expires in ${Math.max(minutes, 1)}m`;
}
