export type Occurrence = {
  // Absent for the pseudo-occurrence a single-date event synthesises from
  // its own starts_at/ends_at: only real event_occurrence rows have an id,
  // and the checkout validates any id it is given against those rows.
  id?: string;
  starts_at: string | Date;
  ends_at: string | Date;
};
