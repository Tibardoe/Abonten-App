"use client";

import { submitPlaceClaimRequest } from "@/actions/submitPlaceClaimRequest";
import ModalShell from "@/components/atoms/ModalShell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import { uploadClaimDocument } from "@/places/utils/uploadClaimDocument";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { formatDate, formatFileSize } from "@abonten/core/i18n/format";
import {
  CLAIM_DOC_ACCEPTED_MIME,
  CLAIM_DOC_MAX_FILES,
  claimDocProblem,
  guessClaimDocMime,
} from "@abonten/core/placeClaimDocuments";
import { DISPUTE_NOTE_MIN_LENGTH } from "@abonten/core/placeClaimInvite";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";

type ClaimPlaceModalProps = {
  placeId: string;
  placeName: string;
  /**
   * "claim": nobody runs the place yet. "dispute": another account runs
   * it, and the visitor says the business is theirs ("I own this
   * business"): the same request, worded as what it is, with an
   * explanation required (placeClaimInvite).
   */
  mode?: "claim" | "dispute";
  /**
   * Staff turned the visitor's last request for this place down recently:
   * when they may ask again. The form is not offered until then.
   */
  retryAfter?: Date | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

type StagedDoc = {
  key: string;
  file: File;
  mimeType: string;
  status: "queued" | "uploading" | "done" | "error";
};

/**
 * The claim form: a note, contact details and up to three proof documents
 * (photos or PDFs, uploaded privately once the request exists, as in the
 * app). Submits via submitPlaceClaimRequest.ts, which only ever creates a
 * pending place_claim_request row -- ownership never changes here, only
 * an approval in Admin › Claims does.
 */
export default function ClaimPlaceModal({
  placeId,
  placeName,
  mode = "claim",
  retryAfter = null,
  onClose,
  onSubmitted,
}: ClaimPlaceModalProps) {
  const t = useTranslations("places");
  const locale = useLocale();
  const toast = useToast();
  const { data: user } = useCurrentUser();
  const dispute = mode === "dispute";

  const [note, setNote] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [docs, setDocs] = useState<StagedDoc[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<"form" | "uploading" | "done">("form");
  const claimIdRef = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const title = dispute
    ? t("disputeTitle", { placeName })
    : t("claim", { placeName });

  const stage = (files: FileList | null) => {
    setProblem(null);
    if (!files) return;
    const next = [...docs];
    for (const file of Array.from(files)) {
      if (next.length >= CLAIM_DOC_MAX_FILES) {
        setProblem(t("youCanAttachUpToDocuments", { CLAIM_DOC_MAX_FILES }));
        break;
      }
      const mimeType = guessClaimDocMime(
        file.name,
        file.name,
        file.type || undefined,
        "application/octet-stream",
      );
      const why = claimDocProblem({ mimeType, sizeBytes: file.size });
      if (why) {
        setProblem(
          why === "type" ? t("onlyJpgPngWebpOrPdf") : t("thatFileIsOver10Mb"),
        );
        continue;
      }
      next.push({
        key: crypto.randomUUID(),
        file,
        mimeType,
        status: "queued",
      });
    }
    setDocs(next);
  };

  const upload = async (list: StagedDoc[]) => {
    const claimId = claimIdRef.current;
    if (!claimId || !user) return;
    for (const doc of list) {
      if (doc.status === "done") continue;
      setDocs((prev) =>
        prev.map((d) =>
          d.key === doc.key ? { ...d, status: "uploading" } : d,
        ),
      );
      try {
        await uploadClaimDocument(user.id, claimId, doc.file, doc.mimeType);
        setDocs((prev) =>
          prev.map((d) => (d.key === doc.key ? { ...d, status: "done" } : d)),
        );
      } catch {
        setDocs((prev) =>
          prev.map((d) => (d.key === doc.key ? { ...d, status: "error" } : d)),
        );
      }
    }
    setPhase("done");
  };

  const handleSubmit = async () => {
    setProblem(null);
    if (dispute && note.trim().length < DISPUTE_NOTE_MIN_LENGTH) {
      setProblem(t("disputeNoteRequired"));
      return;
    }
    setIsSubmitting(true);
    const response = await submitPlaceClaimRequest({
      placeId,
      note: note.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
    }).catch(actionUnreachable);
    setIsSubmitting(false);

    if (response.status !== 200) {
      toast.error(response.message);
      return;
    }
    onSubmitted?.();
    claimIdRef.current =
      "data" in response && response.data ? response.data.claimId : null;
    if (docs.length === 0 || !claimIdRef.current) {
      setPhase("done");
      return;
    }
    setPhase("uploading");
    await upload(docs);
  };

  const failed = docs.filter((d) => d.status === "error");
  const busy = isSubmitting || phase === "uploading";

  return (
    <ModalShell open onClose={onClose} title={title}>
      <div className="w-full self-end md:self-center max-h-[90vh] overflow-y-auto p-4 md:w-[70%] lg:w-[40%] bg-card text-card-foreground rounded-lg space-y-5">
        <div className="flex justify-between items-center gap-3">
          <h1 className="text-xl font-bold">{title}</h1>
          <button
            type="button"
            onClick={onClose}
            className="font-bold text-muted-foreground hover:text-foreground shrink-0"
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>

        {retryAfter ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("disputeWait", { date: formatDate(retryAfter, locale) })}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
            >
              {t("close")}
            </button>
          </div>
        ) : phase === "done" ? (
          <div className="space-y-4 text-center">
            <p className="font-medium">
              {dispute ? t("disputeSentTitle") : t("claimRequestSubmitted")}
            </p>
            <p className="text-sm text-muted-foreground">
              {dispute
                ? t("disputeSentBody")
                : t("yourClaimRequestHasBeenSubmitted")}
            </p>
            {failed.length > 0 ? (
              <div className="space-y-2 text-left">
                <p className="text-sm text-destructive">
                  {t("document", { failedCount: failed.length })}
                </p>
                <ul className="space-y-1">
                  {failed.map((d) => (
                    <li
                      key={d.key}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{d.file.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPhase("uploading");
                          void upload([d]);
                        }}
                        className="text-primary font-medium hover:underline shrink-0"
                      >
                        {t("retry")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
            >
              {t("close")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {dispute ? t("disputeIntro") : t("tellUsWhyYouReThe")}
            </p>

            <label className="block space-y-1">
              <span className="text-sm font-medium">
                {dispute ? t("disputeNoteLabel") : t("noteOptional")}
              </span>
              <textarea
                rows={4}
                maxLength={1000}
                placeholder={
                  dispute
                    ? t("disputeNotePlaceholder")
                    : t("tellUsHowYouReConnected")
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-md border border-input bg-background p-2 text-sm"
              />
            </label>

            {/* Proof: photos or PDFs, private to the claimant and staff. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {dispute
                  ? t("disputeProofLabel")
                  : t("proofOfOwnershipAuthorizationOptional")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("aBusinessRegistrationAUtilityBill", {
                  CLAIM_DOC_MAX_FILES,
                })}
              </p>
              {docs.length > 0 ? (
                <ul className="space-y-1">
                  {docs.map((d) => (
                    <li
                      key={d.key}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">{d.file.name}</span>
                      <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                        {d.status === "uploading"
                          ? t("uploading")
                          : d.status === "done"
                            ? t("uploaded")
                            : d.status === "error"
                              ? t("uploadFailed")
                              : formatFileSize(d.file.size, locale)}
                        {d.status === "queued" && phase === "form" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDocs((prev) =>
                                prev.filter((x) => x.key !== d.key),
                              )
                            }
                            aria-label={t("remove", { name: d.file.name })}
                            className="font-bold hover:text-foreground"
                          >
                            ✕
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {docs.length < CLAIM_DOC_MAX_FILES && phase === "form" ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept={CLAIM_DOC_ACCEPTED_MIME.join(",")}
                    className="hidden"
                    onChange={(e) => {
                      stage(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="border border-border px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors"
                  >
                    {t("addDocument")}
                  </button>
                </>
              ) : null}
            </div>

            <input
              type="tel"
              placeholder={t("contactPhoneOptional")}
              aria-label={t("contactPhoneOptional")}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            <input
              type="email"
              placeholder={t("contactEmailOptional")}
              aria-label={t("contactEmailOptional")}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            {problem ? (
              <p className="text-sm text-destructive" role="alert">
                {problem}
              </p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={handleSubmit}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {phase === "uploading"
                  ? t("uploadingDocuments")
                  : isSubmitting
                    ? t("submitting")
                    : dispute
                      ? t("disputeSubmit")
                      : t("submitClaim")}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 border border-border py-2 rounded-md text-sm hover:bg-accent transition-colors"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
