import {
  HOW_REVIEW_WORKS,
  WHY_VERIFY,
} from "@abonten/core/verification/copy";
import type {
  VerificationEvidenceType,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import { IoCheckmarkCircle, IoInformationCircleOutline } from "react-icons/io5";

// What the owner reads before starting. Three jobs, in order: why the badge
// is worth having, what counts as evidence, and — stated plainly — that
// sending documents is not the same as being approved.

export default function VerificationExplainer({
  subjectType,
  evidenceTypes,
}: {
  subjectType: VerificationSubjectType;
  evidenceTypes: VerificationEvidenceType[];
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-semibold">Why verify</h3>
        <ul className="space-y-1.5">
          {WHY_VERIFY[subjectType].map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm">
              <IoCheckmarkCircle
                aria-hidden
                className="mt-0.5 shrink-0 text-base text-mint"
              />
              <span className="text-muted-foreground">{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">What you can send</h3>
        <p className="text-sm text-muted-foreground">
          Send whatever you have. You do not need all of these, and there is no
          single document Abonten insists on.
        </p>
        <ul className="space-y-2">
          {evidenceTypes.map((t) => (
            <li key={t.key} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{t.label}</p>
              {t.description ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-muted p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <IoInformationCircleOutline aria-hidden className="text-lg" />
          How review works
        </h3>
        <ul className="space-y-1.5">
          {HOW_REVIEW_WORKS.map((line) => (
            <li key={line} className="text-sm text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
