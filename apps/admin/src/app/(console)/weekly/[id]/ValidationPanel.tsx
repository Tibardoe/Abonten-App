import { Card } from "@/components/ui";
import {
  WEEKLY_ISSUE_LABEL,
  WEEKLY_VALIDITY_LABEL,
} from "@abonten/core/weekly/copy";
import type {
  WeeklyAdminSection,
  WeeklyValidation,
  WeeklyValidationIssue,
} from "@abonten/types/weeklyType";

function subjectLabel(
  sections: WeeklyAdminSection[],
  subjectId: string,
): string {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.subjectId === subjectId) {
        return item.event?.title ?? item.place?.name ?? "Listing";
      }
    }
  }
  return "Listing";
}

function sectionTitle(sections: WeeklyAdminSection[], id: string): string {
  return sections.find((s) => s.id === id)?.title ?? "Section";
}

function IssueDetail({
  issue,
  sections,
}: {
  issue: WeeklyValidationIssue;
  sections: WeeklyAdminSection[];
}) {
  if (issue.items?.length) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {issue.items.map((i) => (
          <li key={i.itemId}>
            {subjectLabel(sections, i.subjectId)} —{" "}
            {WEEKLY_VALIDITY_LABEL[i.reason] ?? i.reason}
          </li>
        ))}
      </ul>
    );
  }
  if (issue.subjects?.length) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {issue.subjects.map((s) => (
          <li key={`${s.subjectType}:${s.subjectId}`}>
            {subjectLabel(sections, s.subjectId)}
            {s.sections ? ` — in ${s.sections} sections` : ""}
            {s.editions ? ` — in ${s.editions} recent editions` : ""}
          </li>
        ))}
      </ul>
    );
  }
  if (issue.groups?.length) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {issue.groups.map((g) => (
          <li key={`${g.sectionId}:${g.organizerId}`}>
            {sectionTitle(sections, g.sectionId)} — {g.events} events from one
            organizer
          </li>
        ))}
      </ul>
    );
  }
  if (issue.sectionIds?.length) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {issue.sectionIds.map((id) => (
          <li key={id}>{sectionTitle(sections, id)}</li>
        ))}
      </ul>
    );
  }
  return null;
}

export function ValidationPanel({
  validation,
  sections,
}: {
  validation: WeeklyValidation;
  sections: WeeklyAdminSection[];
}) {
  return (
    <Card className="space-y-3 p-4 text-sm">
      <p className="font-semibold">Checks</p>
      <p className="text-xs text-muted-foreground">
        {validation.validItems} listing
        {validation.validItems === 1 ? "" : "s"} can be shown right now.
        Listings are checked again every time the edition is read, so anything
        cancelled or hidden later disappears on its own.
      </p>
      {validation.errors.length === 0 && validation.warnings.length === 0 ? (
        <p className="text-xs text-success">Ready to publish.</p>
      ) : null}
      {validation.errors.map((issue) => (
        <div key={issue.code} role="alert">
          <p className="text-destructive">{WEEKLY_ISSUE_LABEL[issue.code]}</p>
          <IssueDetail issue={issue} sections={sections} />
        </div>
      ))}
      {validation.warnings.map((issue) => (
        <div key={issue.code}>
          <p className="text-warning">{WEEKLY_ISSUE_LABEL[issue.code]}</p>
          <IssueDetail issue={issue} sections={sections} />
        </div>
      ))}
    </Card>
  );
}
