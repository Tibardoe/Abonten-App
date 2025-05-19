// export function getEventStatusOverlay(
//   starts_at: Date | undefined,
//   ends_at: Date | undefined
// ): string | null {
//   if (!starts_at || !ends_at) return null;

//   const now = new Date();
//   const startDate = new Date(starts_at);
//   const endDate = new Date(ends_at);

//   if (now < startDate) {
//     const isSameDay =
//       now.getFullYear() === startDate.getFullYear() &&
//       now.getMonth() === startDate.getMonth() &&
//       now.getDate() === startDate.getDate();
//     return isSameDay ? "Starting Soon" : null;
//   }

//   if (now >= startDate && now <= endDate) {
//     return "Ongoing";
//   }

//   if (now > endDate) {
//     return "Event Ended";
//   }

//   return null;
// }

export function getEventStatusOverlay(
  starts_at: Date | string | null | undefined,
  ends_at: Date | string | null | undefined,
  event_dates?: string | Date[] | null,
): string | null {
  const now = new Date();

  let startDate = starts_at ? new Date(starts_at) : null;

  let endDate = ends_at ? new Date(ends_at) : null;

  // Fallback to event_dates if start or end is missing
  if ((!startDate || !endDate) && event_dates) {
    let dateList: Date[] = [];

    if (Array.isArray(event_dates)) {
      dateList = event_dates
        .map((d) => new Date(d)) // <- FIXED HERE
        .sort((a, b) => a.getTime() - b.getTime());
    } else if (typeof event_dates === "string") {
      dateList = event_dates
        .split(",")
        .map((d) => new Date(d))
        .sort((a, b) => a.getTime() - b.getTime());
    }

    if (dateList.length > 0) {
      startDate = dateList[0];
      endDate = dateList[0]; // assuming one-day event
    }
  }

  if (!startDate || !endDate) return null;

  if (now < startDate) {
    const isSameDay =
      now.getFullYear() === startDate.getFullYear() &&
      now.getMonth() === startDate.getMonth() &&
      now.getDate() === startDate.getDate();
    return isSameDay ? "Starting Soon" : null;
  }

  if (now >= startDate && now <= endDate) {
    return "Ongoing";
  }

  if (now > endDate) {
    return "Event Ended";
  }

  return null;
}
