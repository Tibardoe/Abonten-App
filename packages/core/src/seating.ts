// Assigned seats (docs/architecture/assigned-seats.md): the rules a seating
// plan follows, checked by the services and the organizer's form (the
// database re-checks rows and seats). A plan is a venue's sections, each
// with its rows front first and the seats in each row.

import type { CoreTranslator } from "./i18n/translator";

export const MAX_SECTIONS = 20;
export const MAX_ROWS_PER_SECTION = 100;
export const MAX_SEATS_PER_ROW = 200;

export type SeatingRow = { label: string; seats: number };
export type SeatingSectionInput = {
  id?: string | null;
  name: string;
  rows: SeatingRow[];
};
export type SeatingPlanInput = {
  name: string;
  sections: SeatingSectionInput[];
};

export type SeatingProblem =
  | "plan_name"
  | "no_sections"
  | "too_many_sections"
  | "section_name"
  | "duplicate_section"
  | "no_rows"
  | "too_many_rows"
  | "row_label"
  | "duplicate_row"
  | "row_seats";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Row labels from `from` to `to` inclusive: letters ("A" to "N") or
 * numbers ("1" to "30"). Null when the two are not of one kind or the
 * range runs backwards or past the row limit.
 */
export function rowLabelsBetween(from: string, to: string): string[] | null {
  const a = from.trim().toUpperCase();
  const b = to.trim().toUpperCase();
  if (/^[A-Z]$/.test(a) && /^[A-Z]$/.test(b)) {
    const i = LETTERS.indexOf(a);
    const j = LETTERS.indexOf(b);
    return j >= i ? LETTERS.slice(i, j + 1).split("") : null;
  }
  if (/^\d{1,3}$/.test(a) && /^\d{1,3}$/.test(b)) {
    const i = Number(a);
    const j = Number(b);
    if (j < i || j - i + 1 > MAX_ROWS_PER_SECTION) return null;
    return Array.from({ length: j - i + 1 }, (_, k) => String(i + k));
  }
  return null;
}

export function sectionSeatCount(rows: readonly SeatingRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.seats) || 0), 0);
}

export function seatingPlanProblem(
  plan: SeatingPlanInput,
): SeatingProblem | null {
  const name = plan.name?.trim() ?? "";
  if (name.length < 1 || name.length > 80) return "plan_name";
  if (!plan.sections || plan.sections.length === 0) return "no_sections";
  if (plan.sections.length > MAX_SECTIONS) return "too_many_sections";
  const sectionNames = new Set<string>();
  for (const section of plan.sections) {
    const sectionName = section.name?.trim() ?? "";
    if (sectionName.length < 1 || sectionName.length > 60)
      return "section_name";
    const key = sectionName.toLowerCase();
    if (sectionNames.has(key)) return "duplicate_section";
    sectionNames.add(key);
    if (!section.rows || section.rows.length === 0) return "no_rows";
    if (section.rows.length > MAX_ROWS_PER_SECTION) return "too_many_rows";
    const labels = new Set<string>();
    for (const row of section.rows) {
      const label = row.label?.trim() ?? "";
      if (label.length < 1 || label.length > 6) return "row_label";
      if (labels.has(label)) return "duplicate_row";
      labels.add(label);
      if (
        !Number.isInteger(row.seats) ||
        row.seats < 1 ||
        row.seats > MAX_SEATS_PER_ROW
      ) {
        return "row_seats";
      }
    }
  }
  return null;
}

export function seatingProblemMessage(
  t: CoreTranslator,
  problem: SeatingProblem,
): string {
  switch (problem) {
    case "plan_name":
      return t("seating.planName");
    case "no_sections":
      return t("seating.noSections");
    case "too_many_sections":
      return t("seating.tooManySections", { max: MAX_SECTIONS });
    case "section_name":
      return t("seating.sectionName");
    case "duplicate_section":
      return t("seating.duplicateSection");
    case "no_rows":
      return t("seating.noRows");
    case "too_many_rows":
      return t("seating.tooManyRows", { max: MAX_ROWS_PER_SECTION });
    case "row_label":
      return t("seating.rowLabel");
    case "duplicate_row":
      return t("seating.duplicateRow");
    case "row_seats":
      return t("seating.rowSeats", { max: MAX_SEATS_PER_ROW });
  }
}
