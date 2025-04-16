export function formatDateWithSuffix(date: string | Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const formattedDate = new Date(date).toLocaleDateString("en-GB", options);

  const day = new Date(date).getDate();
  let suffix = "th";

  if (day % 10 === 1 && day !== 11) {
    suffix = "st";
  } else if (day % 10 === 2 && day !== 12) {
    suffix = "nd";
  } else if (day % 10 === 3 && day !== 13) {
    suffix = "rd";
  }

  // Replace the day number with day + suffix
  return formattedDate.replace(/\d+/, `${day}${suffix}`);
}

export function formatFullDateTimeRange(
  from?: Date | string,
  to?: Date | string,
): { date: string; time: string } {
  const fromObj = from
    ? formatSingleDateTime(from)
    : { date: "N/A", time: "N/A" };
  const toObj = to ? formatSingleDateTime(to) : { date: "N/A", time: "N/A" };

  if (from && to && fromObj.date === toObj.date) {
    return {
      date: fromObj.date,
      time: `${fromObj.time} - ${toObj.time}`,
    };
  }

  return {
    date: `${fromObj.date} - ${toObj.date}`,
    time: `${fromObj.time} - ${toObj.time}`,
  };
}

export function formatSingleDateTime(date: Date | string): {
  date: string;
  time: string;
} {
  const parsedDate = new Date(date);

  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  const day = parsedDate.getDate();
  let suffix = "th";

  if (day % 10 === 1 && day !== 11) suffix = "st";
  else if (day % 10 === 2 && day !== 12) suffix = "nd";
  else if (day % 10 === 3 && day !== 13) suffix = "rd";

  const formattedDate = parsedDate.toLocaleDateString("en-GB", options);
  const [dayStr, monthStr, yearStr] = formattedDate.split(" ");

  const dateStr = `${day}${suffix} ${monthStr}, ${yearStr}`;
  const timeStr = parsedDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return { date: dateStr, time: timeStr };
}
