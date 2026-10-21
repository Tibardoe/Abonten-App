import { formatDateTime } from "@abonten/core/i18n/format";
import type { SafetyMessagePurpose } from "@abonten/types/safetyType";
import { emailT, trFor } from "../i18n/requestLocale";

// The words Abonten Safety sends to other people, always in the
// RECIPIENT's language. The person's name is repeated instead of a pronoun:
// nothing about anyone's gender is assumed, in any language. Texts are one
// catalog message each (optional parts are ICU selects), so no sentence is
// built in code.

export type SafetyWordsInput = {
  person: string;
  /** The person's verified phone, for "Call …". */
  phone: string | null;
  link: string;
  /** A time already written for the recipient (safetyClockTime). */
  time: string | null;
  /** The market's all-emergencies number, for alert texts. */
  emergency: string | null;
  eventTitle: string | null;
};

/** "23:30", or "Sat 02:00" when it is not within the next day. */
export function safetyClockTime(
  at: string | number | Date,
  locale: string,
  timeZone: string,
  now: number = Date.now(),
): string {
  const when = new Date(at).getTime();
  const near = Math.abs(when - now) < 20 * 60 * 60_000;
  return formatDateTime(at, locale, {
    ...(near ? {} : { weekday: "short" }),
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

const yesNo = (value: unknown) => (value ? "yes" : "no");

/** One text message, or null for a purpose that is never texted. */
export function safetySmsText(
  purpose: SafetyMessagePurpose,
  locale: string,
  w: SafetyWordsInput,
): string | null {
  const t = trFor(locale);
  const values = {
    person: w.person,
    phone: w.phone ?? "",
    hasPhone: yesNo(w.phone),
    link: w.link,
    time: w.time ?? "",
    hasTime: yesNo(w.time),
    emergency: w.emergency ?? "",
    hasEmergency: yesNo(w.emergency),
  };
  switch (purpose) {
    case "invite":
      return t("safety.sms.invite", values);
    case "share":
      return t("safety.sms.share", values);
    case "alert":
      return t("safety.sms.alert", values);
    case "check_in_missed":
      return t("safety.sms.checkInMissed", values);
    case "safe":
      return t("safety.sms.safe", values);
    case "false_alarm":
      return t("safety.sms.falseAlarm", values);
    case "event_team":
      return null;
  }
}

export type SafetyEmailWords = {
  subject: string;
  heading: string;
  intro: string;
  buttonLabel: string;
  /** Extra lines under the button ("Call Ama: …", the emergency note). */
  lines: string[];
  /** Why they are getting it. */
  footer: string;
};

export function safetyEmailWords(
  purpose: SafetyMessagePurpose,
  locale: string,
  w: SafetyWordsInput,
): SafetyEmailWords | null {
  const t = emailT(locale);
  const values = {
    person: w.person,
    phone: w.phone ?? "",
    time: w.time ?? "",
    hasTime: yesNo(w.time),
    emergency: w.emergency ?? "",
    event: w.eventTitle ?? "",
    hasEvent: yesNo(w.eventTitle),
  };
  const callLine = w.phone ? [t("safety.callPerson", values)] : [];
  const emergencyLine = w.emergency
    ? [t("safety.emergencyNote", values)]
    : [t("safety.emergencyNoteNoNumber", values)];
  const key = (
    {
      invite: "invite",
      share: "share",
      alert: "alert",
      check_in_missed: "checkInMissed",
      safe: "safe",
      false_alarm: "falseAlarm",
      event_team: null,
    } as const
  )[purpose];
  if (!key) return null;
  const urgent = purpose === "alert" || purpose === "check_in_missed";
  return {
    subject: t(`safety.${key}.subject`, values),
    heading: t(`safety.${key}.heading`, values),
    intro: t(`safety.${key}.intro`, values),
    buttonLabel: t(`safety.${key}.button`, values),
    lines: urgent
      ? [...callLine, ...emergencyLine]
      : purpose === "share"
        ? callLine
        : [],
    footer: t("safety.footer", values),
  };
}

/** The notice id (core notices.*) a push to a contact or the event team uses. */
export function safetyNoticeFor(purpose: SafetyMessagePurpose): string | null {
  switch (purpose) {
    case "alert":
      return "safety_alert";
    case "check_in_missed":
      return "safety_check_in_missed";
    case "share":
      return "safety_share";
    case "safe":
      return "safety_safe";
    case "false_alarm":
      return "safety_false_alarm";
    case "event_team":
      return "safety_event_team";
    case "invite":
      return null;
  }
}
