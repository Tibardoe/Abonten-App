import { formatDistanceToNow } from "date-fns";

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

// export function formatFullDateTimeRange(
//   from?: Date | null | string,
//   to?: Date | null | string,
// ): { date: string; time: string } {
//   const fromObj = from
//     ? formatSingleDateTime(from)
//     : { date: "N/A", time: "N/A" };
//   const toObj = to ? formatSingleDateTime(to) : { date: "N/A", time: "N/A" };

//   if (from && to && fromObj.date === toObj.date) {
//     return {
//       date: fromObj.date,
//       time: `${fromObj.time} - ${toObj.time}`,
//     };
//   }

//   return {
//     date: `${fromObj.date} - ${toObj.date}`,
//     time: `${fromObj.time} - ${toObj.time}`,
//   };
// }

export function formatFullDateTimeRange(
  from?: Date | null | string,
  to?: Date | null | string,
): { date: string; time: string } {
  const fromObj = from
    ? formatSingleDateTime(from)
    : { date: "N/A", time: "N/A" };
  const toObj = to ? formatSingleDateTime(to) : { date: "N/A", time: "N/A" };

  const isSameDate = fromObj.date === toObj.date;

  return {
    date: isSameDate ? fromObj.date : `${fromObj.date} - ${toObj.date}`,
    time: `${fromObj.time} - ${toObj.time}`,
  };
}

export function formatSingleDateTime(date: Date | string): {
  date: string;
  time: string;
} {
  const parsedDate = new Date(date);

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const dayOfWeek = daysOfWeek[parsedDate.getDay()];
  const month = months[parsedDate.getMonth()];
  const day = parsedDate.getDate();
  const year = parsedDate.getFullYear();

  let suffix = "th";
  if (day % 10 === 1 && day !== 11) suffix = "st";
  else if (day % 10 === 2 && day !== 12) suffix = "nd";
  else if (day % 10 === 3 && day !== 13) suffix = "rd";

  // const options: Intl.DateTimeFormatOptions = {
  //   year: "numeric",
  //   month: "short",
  //   day: "numeric",
  // };

  // const day = parsedDate.getDate();
  // let suffix = "th";

  // if (day % 10 === 1 && day !== 11) suffix = "st";
  // else if (day % 10 === 2 && day !== 12) suffix = "nd";
  // else if (day % 10 === 3 && day !== 13) suffix = "rd";

  // const formattedDate = parsedDate.toLocaleDateString("en-GB", options);
  // const [monthStr, yearStr] = formattedDate.split(" ");

  const formattedDate = `${dayOfWeek}, ${day}${suffix} ${month} ${year}`;

  // const dateStr = `${day}${suffix} ${monthStr}, ${yearStr}`;
  // const timeStr = parsedDate.toLocaleTimeString("en-US", {
  //   hour: "2-digit",
  //   minute: "2-digit",
  //   hour12: true,
  // });

  const timeStr = parsedDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return { date: formattedDate, time: timeStr };
}

export function getRelativeTime(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true }).replace(
    "about ",
    "",
  );
}

export function formatSpecificDateWithTimeRange(item: {
  date: Date;
  from: Date;
  to: Date;
}): string {
  const dateStr = formatSingleDateTime(item.date).date;

  const fromTime = item.from.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const toTime = item.to.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${dateStr} ${fromTime} - ${toTime}`;
}

export function getDateParts(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;

  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const day = daysOfWeek[date.getDay()];
  const month = months[date.getMonth()];
  const dateNum = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const formattedTime = `${hours % 12 || 12}:${minutes
    .toString()
    .padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;

  return {
    day,
    month,
    date: dateNum,
    time: formattedTime,
  };
}

export function getFormattedEventDate(
  startsAt: string | Date | null | undefined,
  endsAt: string | Date | null | undefined,
  fallbackDates?: [] | Date[] | undefined | string,
): { date: string; time: string } {
  const formatted = formatFullDateTimeRange(startsAt, endsAt);

  const hasValidDates =
    formatted.date !== "N/A - N/A" && formatted.time !== "N/A - N/A";

  if (hasValidDates) {
    return formatted;
  }

  if (fallbackDates?.[0]) {
    return formatSingleDateTime(fallbackDates[0]);
  }

  return { date: "Date not available", time: "Time not available" };
}
