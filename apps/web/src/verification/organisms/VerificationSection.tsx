"use client";

import { getSubjectVerification } from "@/actions/verification/getSubjectVerification";
import { startVerificationCase } from "@/actions/verification/startVerificationCase";
import { submitVerificationCase } from "@/actions/verification/submitVerificationCase";
import { updateVerificationCase } from "@/actions/verification/updateVerificationCase";
import { withdrawVerificationCase } from "@/actions/verification/withdrawVerificationCase";
import { useToast } from "@/hooks/useToast";
import VerificationExplainer from "@/verification/molecules/VerificationExplainer";
import VerificationStatusCard from "@/verification/molecules/VerificationStatusCard";
import VerificationEvidenceUploader from "@/verification/organisms/VerificationEvidenceUploader";
import {
  ORGANIZER_TYPE_DESCRIPTION,
  ORGANIZER_TYPE_LABEL,
} from "@abonten/core/verification/copy";
import { isEditable } from "@abonten/core/verification/stateMachine";
import type {
  OrganizerType,
  SubjectVerificationView,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import { useCallback, useEffect, useState } from "react";

// The whole owner-facing verification experience for one subject, used by
// both the place management tab and the organizer verification page.
//
// Every state the request can be in is handled here: nothing started, draft
// being assembled, in review, sent back for more information, approved,
// rejected, withdrawn, revoked — plus the programme being switched off, in
// which case the section simply does not appear.

type Props = {
  subjectType: VerificationSubjectType;
  subjectId: string;
  /** Server-rendered first view, so the tab has no loading flash. */
  initial?: SubjectVerificationView | null;
};

export default function VerificationSection({
  subjectType,
  subjectId,
  initial = null,
}: Props) {
  const toast = useToast();
  const [view, setView] = useState<SubjectVerificationView | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [organizerType, setOrganizerType] = useState<OrganizerType | "">("");
  const [legalName, setLegalName] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    const res = await getSubjectVerification({ subjectType, subjectId });
    if (res.status === 200 && res.data) {
      setView(res.data);
      const c = res.data.openCase;
      if (c) {
        setLegalName(c.legalName ?? "");
        setNote(c.applicantNote ?? "");
        setOrganizerType((c.organizerType as OrganizerType) ?? "");
      }
    }
    setLoading(false);
  }, [subjectType, subjectId]);

  useEffect(() => {
    if (!initial) void refresh();
  }, [initial, refresh]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load verification.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          Try again
        </button>
      </div>
    );
  }

  const { approved, openCase, lastClosedCase, program, evidenceTypes } = view;
  const programOpen =
    subjectType === "place"
      ? program.placeRequestsEnabled
      : program.organizerRequestsEnabled;

  // Approved and nothing new in flight: show the badge state and stop.
  if (approved && !openCase) {
    return (
      <div className="space-y-4">
        <VerificationStatusCard
          status="approved"
          subjectType={subjectType}
          subjectName={view.subjectName}
          verifiedAt={approved.reviewedAt}
        />
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">What your badge says</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Abonten reviewed documents supporting your business and your link to
            this account. It is not a statement about your service, prices or
            quality.
          </p>
        </div>
        {approved.evidence.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {approved.evidence.length} document
            {approved.evidence.length === 1 ? "" : "s"} are held for this
            verification. They stay private and are deleted once they are no
            longer needed.
          </p>
        ) : null}
      </div>
    );
  }

  async function start() {
    if (subjectType === "organizer" && !organizerType) {
      toast.error("Choose the kind of organizer you are first.");
      return;
    }
    setBusy(true);
    const res = await startVerificationCase({
      subjectType,
      subjectId,
      organizerType: organizerType || null,
      legalName: legalName.trim() || null,
      applicantNote: note.trim() || null,
    });
    setBusy(false);
    if (res.status === 200) {
      await refresh();
    } else {
      toast.error(res.message ?? "Could not start verification.");
    }
  }

  async function saveDetails(caseId: string) {
    setBusy(true);
    const res = await updateVerificationCase({
      caseId,
      organizerType: subjectType === "organizer" ? organizerType || null : null,
      legalName: legalName.trim() || null,
      applicantNote: note.trim() || null,
    });
    setBusy(false);
    if (res.status === 200) toast.success("Saved.");
    else toast.error(res.message ?? "Could not save.");
  }

  async function submit(caseId: string) {
    setBusy(true);
    // Persist any typed details first so the reviewer sees them.
    await updateVerificationCase({
      caseId,
      organizerType: subjectType === "organizer" ? organizerType || null : null,
      legalName: legalName.trim() || null,
      applicantNote: note.trim() || null,
    });
    const res = await submitVerificationCase({ caseId });
    setBusy(false);
    if (res.status === 200) {
      toast.success(res.message ?? "Sent for review.");
      await refresh();
    } else {
      toast.error(res.message ?? "Could not send your request.");
    }
  }

  async function withdraw(caseId: string) {
    if (!confirm("Cancel this verification request?")) return;
    setBusy(true);
    const res = await withdrawVerificationCase({ caseId });
    setBusy(false);
    if (res.status === 200) {
      toast.success("Request withdrawn.");
      await refresh();
    } else {
      toast.error(res.message ?? "Could not withdraw the request.");
    }
  }

  // A case the owner can still work on.
  if (openCase) {
    const editable = isEditable(openCase.status);
    const uploadedCount = openCase.evidence.filter(
      (e) => e.status !== "purged",
    ).length;

    return (
      <div className="space-y-4">
        <VerificationStatusCard
          status={openCase.status}
          subjectType={subjectType}
          subjectName={view.subjectName}
          reason={openCase.decisionReason}
          submittedAt={openCase.submittedAt}
        />

        {editable ? (
          <>
            {subjectType === "organizer" ? (
              <OrganizerTypePicker
                value={organizerType}
                onChange={setOrganizerType}
                allowed={program.organizerTypes}
              />
            ) : null}

            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="space-y-1">
                <label htmlFor="legal-name" className="text-sm font-medium">
                  Registered name (optional)
                </label>
                <input
                  id="legal-name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="The name exactly as it appears on your documents"
                  className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="applicant-note" className="text-sm font-medium">
                  Anything the reviewer should know (optional)
                </label>
                <textarea
                  id="applicant-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="For example: the permit is in my father's name, he is the registered owner."
                  className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => saveDetails(openCase.id)}
                disabled={busy}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              >
                Save details
              </button>
            </div>

            <VerificationEvidenceUploader
              caseId={openCase.id}
              evidenceTypes={evidenceTypes}
              existing={openCase.evidence}
              maxFiles={program.maxEvidenceFiles}
              maxFileBytes={program.maxFileBytes}
              onChanged={() => void refresh()}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => submit(openCase.id)}
                disabled={busy || uploadedCount === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {openCase.status === "needs_info"
                  ? "Send again for review"
                  : "Send for review"}
              </button>
              <button
                type="button"
                onClick={() => withdraw(openCase.id)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Cancel request
              </button>
            </div>
            {uploadedCount === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add at least one document before sending.
              </p>
            ) : null}
          </>
        ) : (
          <>
            {openCase.evidence.length > 0 ? (
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">What you sent</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {openCase.evidence.map((e) => (
                    <li key={e.id}>
                      {e.evidenceTypeLabel ?? e.evidenceType}
                      {e.fileName ? ` — ${e.fileName}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => withdraw(openCase.id)}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              Cancel request
            </button>
          </>
        )}
      </div>
    );
  }

  // Nothing open. Show the last outcome, then the way back in.
  return (
    <div className="space-y-4">
      {lastClosedCase ? (
        <VerificationStatusCard
          status={lastClosedCase.status}
          subjectType={subjectType}
          subjectName={view.subjectName}
          reason={lastClosedCase.decisionReason}
        />
      ) : null}

      {!programOpen ? (
        <p className="text-sm text-muted-foreground">
          Verification isn&apos;t open yet. We&apos;ll let you know when you can
          apply.
        </p>
      ) : !view.canStart ? (
        <p className="text-sm text-muted-foreground">
          {view.blockedReason ?? "Verification isn't available right now."}
        </p>
      ) : (
        <>
          <VerificationExplainer
            subjectType={subjectType}
            evidenceTypes={evidenceTypes}
          />
          {subjectType === "organizer" ? (
            <OrganizerTypePicker
              value={organizerType}
              onChange={setOrganizerType}
              allowed={program.organizerTypes}
            />
          ) : null}
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {lastClosedCase ? "Start a new request" : "Start verification"}
          </button>
        </>
      )}
    </div>
  );
}

function OrganizerTypePicker({
  value,
  onChange,
  allowed,
}: {
  value: OrganizerType | "";
  onChange: (v: OrganizerType) => void;
  allowed: OrganizerType[];
}) {
  if (allowed.length === 0) return null;
  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-medium">
        What kind of organizer are you?
      </legend>
      {allowed.map((t) => (
        <label
          key={t}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            value === t ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <input
            type="radio"
            name="organizer-type"
            value={t}
            checked={value === t}
            onChange={() => onChange(t)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">
              {ORGANIZER_TYPE_LABEL[t]}
            </span>
            <span className="block text-sm text-muted-foreground">
              {ORGANIZER_TYPE_DESCRIPTION[t]}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
