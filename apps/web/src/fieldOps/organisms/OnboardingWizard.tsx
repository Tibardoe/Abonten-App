"use client";

import { removeFieldOpsEvidence } from "@/actions/fieldOps/removeFieldOpsEvidence";
import { requestFieldOpsEvidenceUpload } from "@/actions/fieldOps/requestFieldOpsEvidenceUpload";
import { requestFieldOpsOwnerOtp } from "@/actions/fieldOps/requestFieldOpsOwnerOtp";
import { searchFieldOpsSimilarPlaces } from "@/actions/fieldOps/searchFieldOpsSimilarPlaces";
import { submitFieldOpsClaimAssist } from "@/actions/fieldOps/submitFieldOpsClaimAssist";
import { submitFieldOpsOnboarding } from "@/actions/fieldOps/submitFieldOpsOnboarding";
import { verifyFieldOpsOwnerOtp } from "@/actions/fieldOps/verifyFieldOpsOwnerOtp";
import { withdrawFieldOpsOnboarding } from "@/actions/fieldOps/withdrawFieldOpsOnboarding";
import getPlacePhotoUploadSignature from "@/actions/getPlacePhotoUploadSignature";
import OtpInput from "@/components/molecules/OtpInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/config/supabase/client";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import {
  type WizardPhoto,
  type WizardState,
  clearWizardState,
  emptyWizardState,
  loadWizardState,
  saveWizardState,
  toE164,
} from "@/fieldOps/lib/wizardStorage";
import { useToast } from "@/hooks/useToast";
import PlaceCategoryPicker from "@/places/molecules/PlaceCategoryPicker";
import PlaceOpeningHoursEditor from "@/places/molecules/PlaceOpeningHoursEditor";
import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import type {
  FieldOpsOnboardingDraft,
  FieldOpsOnboardingEvidence,
  FieldOpsSimilarPlace,
} from "@abonten/types/fieldOps";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const STEPS = ["Business", "Owner", "Details", "Photos", "Submit"] as const;

type Position = { lat: number; lng: number; accuracyM: number };

function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      () => reject(new Error("Turn on location for this site and try again.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    );
  });
}

/**
 * The five-step onboarding wizard. Every step saves to sessionStorage; the
 * owner and evidence steps also write to the server as they happen, so a
 * resumed draft shows what is already done.
 */
export default function OnboardingWizard({
  campaignId,
  draft,
}: {
  campaignId: string;
  draft: FieldOpsOnboardingDraft;
}) {
  const toast = useToast();
  const router = useRouter();
  const o = draft.onboarding;
  const dial = draft.dialCode;
  const [pending, start] = useTransition();
  const [state, setState] = useState<WizardState>(() =>
    emptyWizardState({ name: o.businessName, ownerFullName: o.ownerFullName }),
  );
  const [hydrated, setHydrated] = useState(false);
  const [similar, setSimilar] = useState<FieldOpsSimilarPlace[] | null>(null);
  const [otpSent, setOtpSent] = useState(Boolean(o.ownerPhoneMasked));
  const [ownerMasked, setOwnerMasked] = useState(o.ownerPhoneMasked);
  const [consentPath, setConsentPath] = useState(draft.ownerOtp.consentPath);
  const [resendIn, setResendIn] = useState(draft.ownerOtp.resendInSeconds);
  const [code, setCode] = useState("");
  const [ownerVerified, setOwnerVerified] = useState(o.ownerVerified);
  const [evidence, setEvidence] = useState<FieldOpsOnboardingEvidence[]>(
    draft.evidence,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const evidenceInput = useRef<HTMLInputElement>(null);
  const [evidenceKind, setEvidenceKind] = useState<
    "storefront" | "interior" | "owner_consent" | "other"
  >("storefront");

  useEffect(() => {
    const saved = loadWizardState(o.id);
    if (saved) setState(saved);
    setHydrated(true);
  }, [o.id]);
  useEffect(() => {
    if (hydrated) saveWizardState(o.id, state);
  }, [hydrated, state, o.id]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));
  const step = state.step;
  const goTo = (n: number) =>
    patch({ step: Math.max(1, Math.min(STEPS.length, n)) });
  const isOffline = o.mode === "offline";

  // ── Step 1: business + duplicates ───────────────────────
  const locate = async () => {
    setBusy("locate");
    try {
      const p = await currentPosition();
      patch({
        location: { lat: p.lat, lng: p.lng },
        locationAccuracyM: p.accuracyM,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const checkDuplicates = () =>
    start(async () => {
      if (!state.location) {
        toast.error(
          "Set the pin first (use my location, or type coordinates).",
        );
        return;
      }
      const res = await searchFieldOpsSimilarPlaces({
        campaignId,
        onboardingId: o.id,
        name: state.name,
        location: state.location,
        phoneE164: toE164(state.phone, dial),
        whatsappE164: toE164(state.whatsapp, dial),
      });
      if (res.status !== 200 || !res.data) {
        toast.error(res.message ?? "Couldn't check for duplicates.");
        return;
      }
      setSimilar(res.data);
      if (res.data.length === 0) goTo(2);
    });

  // ── Step 2: owner ───────────────────────────────────────
  const sendCode = () =>
    start(async () => {
      const phone = toE164(state.ownerPhone, dial);
      if (!phone) {
        toast.error(
          `Enter the owner's phone, e.g. 024 123 4567 or ${dial}241234567.`,
        );
        return;
      }
      const res = await requestFieldOpsOwnerOtp({
        campaignId,
        onboardingId: o.id,
        ownerFullName: state.ownerFullName,
        ownerPhoneE164: phone,
      });
      if (res.status === 200 && res.data) {
        setOtpSent(true);
        setOwnerMasked(res.data.ownerPhoneMasked);
        setConsentPath(res.data.consentPath);
        setResendIn(res.data.resendInSeconds);
        toast.success(res.message ?? "Code sent.");
      } else {
        toast.error(res.message ?? "Couldn't send the code.");
      }
    });
  const verifyCode = () =>
    start(async () => {
      const res = await verifyFieldOpsOwnerOtp({
        campaignId,
        onboardingId: o.id,
        code,
      });
      if (res.status === 200) {
        setOwnerVerified(true);
        toast.success("Owner verified.");
        // Claim assistance ends here: the listing already exists, so there
        // is nothing left for the member to fill in.
        if (!state.claimPlaceId) goTo(3);
      } else {
        toast.error(res.message ?? "That code didn't work.");
      }
    });
  const refreshOwner = () => router.refresh();

  // ── Step 4: photos ──────────────────────────────────────
  const uploadPlacePhoto = async (file: File): Promise<WizardPhoto | null> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image.");
      return null;
    }
    if (file.size > MAX_EVENT_FLYER_SIZE_BYTES) {
      toast.error("That photo is over 5 MB.");
      return null;
    }
    const sig = await getPlacePhotoUploadSignature();
    if (sig.status !== 200 || !sig.data) {
      toast.error(sig.message ?? "Couldn't start the upload.");
      return null;
    }
    try {
      const { promise } = uploadToCloudinary({
        file,
        cloudName: sig.data.cloudName as string,
        apiKey: sig.data.apiKey as string,
        timestamp: sig.data.timestamp,
        signature: sig.data.signature,
        folder: sig.data.folder,
        allowedFormats: sig.data.allowedFormats,
        resourceType: "image",
      });
      const result = await promise;
      return {
        publicId: result.public_id,
        version: String(result.version),
        url: buildCloudinaryUrl(result.public_id, String(result.version), {
          width: 400,
          height: 400,
        }),
      };
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };
  const onCover = async (file: File | undefined) => {
    if (!file) return;
    setBusy("cover");
    const photo = await uploadPlacePhoto(file);
    if (photo) patch({ cover: photo });
    setBusy(null);
  };
  const onGallery = async (files: FileList | null) => {
    if (!files) return;
    setBusy("gallery");
    for (const file of Array.from(files).slice(0, 10 - state.photos.length)) {
      const photo = await uploadPlacePhoto(file);
      if (photo) setState((s) => ({ ...s, photos: [...s.photos, photo] }));
    }
    setBusy(null);
  };
  const onEvidence = async (file: File | undefined) => {
    if (!file) return;
    setBusy("evidence");
    try {
      let pos: Position | null = null;
      if (isOffline) {
        try {
          pos = await currentPosition();
        } catch {
          pos = null;
        }
      }
      const ticket = await requestFieldOpsEvidenceUpload({
        campaignId,
        onboardingId: o.id,
        kind: evidenceKind,
        mimeType: file.type,
        sizeBytes: file.size,
        capturedAt: new Date().toISOString(),
        location: pos ? { lat: pos.lat, lng: pos.lng } : null,
        accuracyM: pos?.accuracyM ?? null,
      });
      if (ticket.status !== 200 || !ticket.data) {
        toast.error(ticket.message ?? "Couldn't start the upload.");
        return;
      }
      const { error } = await supabase.storage
        .from(ticket.data.bucket)
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, {
          contentType: file.type,
        });
      if (error) {
        toast.error(`Upload failed: ${error.message}`);
        await removeFieldOpsEvidence({
          campaignId,
          onboardingId: o.id,
          evidenceId: ticket.data.evidenceId,
        });
        return;
      }
      setEvidence((list) => [
        ...list,
        {
          id: ticket.data?.evidenceId as string,
          kind: evidenceKind,
          url: URL.createObjectURL(file),
          capturedAt: new Date().toISOString(),
          capturedLocation: pos ? { lat: pos.lat, lng: pos.lng } : null,
          accuracyM: pos?.accuracyM ?? null,
          uploadedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(null);
    }
  };
  const dropEvidence = (id: string) =>
    start(async () => {
      const res = await removeFieldOpsEvidence({
        campaignId,
        onboardingId: o.id,
        evidenceId: id,
      });
      if (res.status === 200) setEvidence((l) => l.filter((e) => e.id !== id));
      else toast.error(res.message ?? "Couldn't remove it.");
    });

  // ── Step 5: submit ──────────────────────────────────────
  // Claim assistance: the business is already listed, so there is nothing
  // to fill in beyond proving who the owner is. It ends the wizard early.
  const submitClaim = () =>
    start(async () => {
      if (!state.claimPlaceId) return;
      let here: Position | null = null;
      if (isOffline) {
        try {
          here = await currentPosition();
        } catch {
          here = null;
        }
      }
      const res = await submitFieldOpsClaimAssist({
        campaignId,
        onboardingId: o.id,
        placeId: state.claimPlaceId,
        submissionLocation: here ? { lat: here.lat, lng: here.lng } : null,
        submissionAccuracyM: here?.accuracyM ?? null,
      });
      if (res.status === 200) {
        clearWizardState(o.id);
        toast.success(res.message ?? "Claim filed.");
        router.push(`/field/submissions/${o.id}`);
      } else {
        toast.error(res.message ?? "Couldn't file the claim.");
      }
    });

  const submit = () =>
    start(async () => {
      if (!state.location || !state.cover || state.categoryId === null) {
        toast.error("The pin, a category and a cover photo are required.");
        return;
      }
      let here: Position | null = null;
      if (isOffline) {
        try {
          here = await currentPosition();
        } catch (e) {
          toast.error((e as Error).message);
          return;
        }
      }
      const res = await submitFieldOpsOnboarding({
        campaignId,
        onboardingId: o.id,
        place: {
          name: state.name,
          categoryId: state.categoryId,
          description: state.description,
          address: state.address,
          location: state.location,
          websiteUrl: state.websiteUrl || null,
          phoneE164: toE164(state.phone, dial),
          whatsappE164: toE164(state.whatsapp, dial),
          openingHours: state.openingHours,
          cover: {
            publicId: state.cover.publicId,
            version: state.cover.version,
          },
          photos: state.photos.map((p) => ({
            publicId: p.publicId,
            version: p.version,
          })),
        },
        submissionLocation: here ? { lat: here.lat, lng: here.lng } : null,
        submissionAccuracyM: here?.accuracyM ?? null,
        duplicateAcknowledged: state.duplicateAcknowledged,
      });
      if (res.status === 200) {
        clearWizardState(o.id);
        toast.success(res.message ?? "Submitted.");
        router.push(`/field/submissions/${o.id}`);
      } else {
        toast.error(res.message ?? "Couldn't submit.");
      }
    });
  const withdraw = () =>
    start(async () => {
      if (!confirm("Withdraw this onboarding? You can start a new one later."))
        return;
      const res = await withdrawFieldOpsOnboarding({
        campaignId,
        onboardingId: o.id,
      });
      if (res.status === 200) {
        clearWizardState(o.id);
        router.push("/field/submissions");
      } else toast.error(res.message ?? "Couldn't withdraw.");
    });

  const evidenceReady =
    !isOffline ||
    (evidence.some((e) => e.kind === "storefront") &&
      evidence.some((e) => e.kind === "interior"));
  // Caught here rather than at submit: a number that cannot be read is the
  // one thing on this step the server refuses outright, and finding that out
  // after the photos are uploaded is a long walk back.
  const phoneError =
    state.phone.trim() && !toE164(state.phone, dial)
      ? "Check this number."
      : null;
  const whatsappError =
    state.whatsapp.trim() && !toE164(state.whatsapp, dial)
      ? "Check this number."
      : null;
  const detailsReady =
    state.name.trim().length >= 2 &&
    state.categoryId !== null &&
    state.description.trim().length >= 20 &&
    state.address.trim().length >= 3 &&
    !phoneError &&
    !whatsappError &&
    state.location !== null;

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex gap-1 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex-1 rounded-full px-2 py-1 text-center ${
              i + 1 === step
                ? "bg-primary text-primary-foreground"
                : i + 1 < step
                  ? "bg-primary/20"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>
      {o.status === "needs_changes" && o.reviewNote ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Your team lead asked for changes: {o.reviewNote}
        </p>
      ) : null}

      {step === 1 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">The business</h2>
          <div className="flex flex-col gap-1">
            <Label htmlFor="w-name">Business name</Label>
            <Input
              id="w-name"
              value={state.name}
              onChange={(e) => patch({ name: e.target.value })}
              maxLength={150}
              placeholder="e.g. Auntie Ama's Chop Bar"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Where is it?</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={locate}
                disabled={busy === "locate"}
              >
                {busy === "locate" ? "Locating…" : "Use my location"}
              </Button>
              <Input
                className="w-32"
                inputMode="decimal"
                placeholder="Latitude"
                value={state.location?.lat ?? ""}
                onChange={(e) =>
                  patch({
                    location: {
                      lat: Number(e.target.value),
                      lng: state.location?.lng ?? 0,
                    },
                  })
                }
              />
              <Input
                className="w-32"
                inputMode="decimal"
                placeholder="Longitude"
                value={state.location?.lng ?? ""}
                onChange={(e) =>
                  patch({
                    location: {
                      lat: state.location?.lat ?? 0,
                      lng: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            {state.location ? (
              <p className="text-xs text-muted-foreground">
                Pin at {state.location.lat.toFixed(5)},{" "}
                {state.location.lng.toFixed(5)}
                {state.locationAccuracyM
                  ? ` (±${Math.round(state.locationAccuracyM)} m)`
                  : ""}
                {isOffline ? ". Stand at the entrance when you set it." : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={checkDuplicates}
              disabled={
                pending || state.name.trim().length < 2 || !state.location
              }
            >
              Check it isn't on Abonten already
            </Button>
          </div>
          {similar && similar.length > 0 ? (
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Is it one of these?</p>
              <ul className="mt-2 space-y-2 text-sm">
                {similar.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      <Link
                        href={`/places/${m.slug}`}
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        {m.name}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        · {m.distanceM} m away
                        {m.phoneMatch ? " · same phone" : ""}
                      </span>
                    </span>
                    {m.strong ? (
                      <StatusChip status="uncovered" label="likely match" />
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                If the business is already listed, don&apos;t list it again.
                Pick it below and help the owner claim it instead &mdash; you
                still earn for that, once an admin approves the claim.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {similar.map((m) => (
                  <Button
                    key={`claim-${m.id}`}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      patch({ claimPlaceId: m.id, claimPlaceName: m.name });
                      goTo(2);
                    }}
                  >
                    Help them claim {m.name}
                  </Button>
                ))}
                <Button
                  type="button"
                  onClick={() => {
                    patch({
                      duplicateAcknowledged: true,
                      claimPlaceId: null,
                      claimPlaceName: null,
                    });
                    goTo(2);
                  }}
                >
                  None of these, continue
                </Button>
                <Button type="button" variant="ghost" onClick={withdraw}>
                  Withdraw
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">The owner</h2>
          {state.claimPlaceId ? (
            <p className="rounded-md border border-dashed p-3 text-sm">
              You&apos;re helping the owner of{" "}
              <span className="font-medium">{state.claimPlaceName}</span> claim
              their existing listing. Verify their phone below, then file the
              claim &mdash; there is nothing else to fill in.
            </p>
          ) : null}
          {ownerVerified ? (
            <p className="rounded-md bg-emerald-500/10 p-3 text-sm">
              Owner verified{ownerMasked ? ` (${ownerMasked})` : ""}. Their
              Abonten account will own this listing.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                A code goes to the owner&apos;s phone. By entering it they agree
                to list their business on Abonten. It must be their own number,
                not yours.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="w-owner">Owner&apos;s full name</Label>
                  <Input
                    id="w-owner"
                    value={state.ownerFullName}
                    onChange={(e) => patch({ ownerFullName: e.target.value })}
                    maxLength={120}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="w-owner-phone">Owner&apos;s phone</Label>
                  <Input
                    id="w-owner-phone"
                    inputMode="tel"
                    placeholder="+233241234567"
                    value={state.ownerPhone}
                    onChange={(e) => patch({ ownerPhone: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={sendCode}
                  disabled={
                    pending ||
                    resendIn > 0 ||
                    state.ownerFullName.trim().length < 2
                  }
                >
                  {otpSent
                    ? resendIn > 0
                      ? `Resend in ${resendIn}s`
                      : "Resend code"
                    : "Send the code"}
                </Button>
              </div>
              {otpSent ? (
                <div className="flex flex-col gap-2">
                  {consentPath ? (
                    <p className="rounded-md bg-muted p-3 text-sm">
                      Online mode: send the owner this link so they enter the
                      code themselves:{" "}
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `${window.location.origin}${consentPath}`,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        share on WhatsApp
                      </a>
                      . Then tap &quot;Check&quot; below.
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-2"
                        onClick={refreshOwner}
                      >
                        Check
                      </Button>
                    </p>
                  ) : null}
                  <Label>Or enter the code the owner received</Label>
                  <OtpInput
                    value={code}
                    onChange={setCode}
                    disabled={pending}
                  />
                  <div>
                    <Button
                      type="button"
                      onClick={verifyCode}
                      disabled={pending || code.length < 4}
                    >
                      Verify
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => goTo(1)}>
              Back
            </Button>
            {state.claimPlaceId ? (
              <Button
                type="button"
                onClick={submitClaim}
                disabled={!ownerVerified || pending}
              >
                File the claim
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => goTo(3)}
                disabled={!ownerVerified}
              >
                Next
              </Button>
            )}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">Details</h2>
          <PlaceCategoryPicker
            categoryId={state.categoryId}
            onSelect={(id) => patch({ categoryId: id })}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="w-desc">
              Description (at least 20 characters; 80+ to qualify)
            </Label>
            <Textarea
              id="w-desc"
              rows={4}
              maxLength={2000}
              value={state.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {state.description.length} characters
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="w-address">Address / landmark</Label>
            <Input
              id="w-address"
              maxLength={300}
              value={state.address}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="e.g. Opposite the lorry station, Ejisu"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="w-phone">Business phone</Label>
              <Input
                id="w-phone"
                inputMode="tel"
                placeholder={`024 123 4567 or ${dial}241234567`}
                aria-invalid={phoneError ? true : undefined}
                value={state.phone}
                onChange={(e) => patch({ phone: e.target.value })}
              />
              {phoneError ? (
                <p className="text-xs text-destructive">{phoneError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="w-wa">WhatsApp</Label>
              <Input
                id="w-wa"
                inputMode="tel"
                placeholder={`024 123 4567 or ${dial}241234567`}
                aria-invalid={whatsappError ? true : undefined}
                value={state.whatsapp}
                onChange={(e) => patch({ whatsapp: e.target.value })}
              />
              {whatsappError ? (
                <p className="text-xs text-destructive">{whatsappError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="w-web">Website</Label>
              <Input
                id="w-web"
                placeholder="https://"
                value={state.websiteUrl}
                onChange={(e) => patch({ websiteUrl: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Opening hours</Label>
            <PlaceOpeningHoursEditor
              openingHours={state.openingHours}
              onChange={(openingHours) => patch({ openingHours })}
            />
          </div>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => goTo(2)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => goTo(4)}
              disabled={!detailsReady}
            >
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="flex flex-col gap-4 rounded-xl border p-4">
          <h2 className="font-semibold">Photos</h2>
          <div>
            <p className="text-sm font-medium">
              Cover photo (shown on the listing)
            </p>
            <input
              ref={coverInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onCover(e.target.files?.[0])}
            />
            <div className="mt-2 flex items-center gap-3">
              {state.cover ? (
                <img
                  src={state.cover.url}
                  alt="Cover"
                  className="h-20 w-20 rounded object-cover"
                />
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => coverInput.current?.click()}
                disabled={busy !== null}
              >
                {busy === "cover"
                  ? "Uploading…"
                  : state.cover
                    ? "Replace"
                    : "Take / pick photo"}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">
              More photos of the business (up to 10)
            </p>
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onGallery(e.target.files)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {state.photos.map((p) => (
                <button
                  key={p.publicId}
                  type="button"
                  title="Remove"
                  onClick={() =>
                    patch({
                      photos: state.photos.filter(
                        (x) => x.publicId !== p.publicId,
                      ),
                    })
                  }
                >
                  <img
                    src={p.url}
                    alt=""
                    className="h-16 w-16 rounded object-cover"
                  />
                </button>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => galleryInput.current?.click()}
                disabled={busy !== null || state.photos.length >= 10}
              >
                {busy === "gallery" ? "Uploading…" : "Add photos"}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">
              Evidence{" "}
              {isOffline ? "(storefront and interior required)" : "(optional)"}
            </p>
            <p className="text-xs text-muted-foreground">
              Only your team lead and Abonten staff see these. Your position is
              recorded with each one.
            </p>
            <input
              ref={evidenceInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onEvidence(e.target.files?.[0])}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={evidenceKind}
                onChange={(e) =>
                  setEvidenceKind(e.target.value as typeof evidenceKind)
                }
              >
                <option value="storefront">Storefront</option>
                <option value="interior">Interior</option>
                <option value="owner_consent">Owner consent</option>
                <option value="other">Other</option>
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => evidenceInput.current?.click()}
                disabled={busy !== null || evidence.length >= 8}
              >
                {busy === "evidence" ? "Uploading…" : "Take photo"}
              </Button>
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {evidence.map((e) => (
                <li key={e.id} className="text-center text-xs">
                  {e.url ? (
                    <img
                      src={e.url}
                      alt={e.kind}
                      className="h-16 w-16 rounded object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded bg-muted" />
                  )}
                  <div className="capitalize">{e.kind.replace("_", " ")}</div>
                  <button
                    type="button"
                    className="text-destructive"
                    onClick={() => dropEvidence(e.id)}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => goTo(3)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => goTo(5)}
              disabled={!state.cover || !evidenceReady}
            >
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">Review and submit</h2>
          <dl className="grid grid-cols-3 gap-1 text-sm">
            <dt className="text-muted-foreground">Business</dt>
            <dd className="col-span-2">{state.name}</dd>
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="col-span-2">
              {/* The saved draft wins when this tab never typed the name
                  (resumed on another device, or after clearing the tab). */}
              {state.ownerFullName || o.ownerFullName || ""}{" "}
              {ownerMasked ? `· ${ownerMasked}` : ""}
            </dd>
            <dt className="text-muted-foreground">Address</dt>
            <dd className="col-span-2">{state.address}</dd>
            <dt className="text-muted-foreground">Photos</dt>
            <dd className="col-span-2">
              {state.cover ? 1 : 0} cover + {state.photos.length} more ·{" "}
              {evidence.length} evidence
            </dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            Submitting creates the listing under the owner&apos;s account and
            sends it to your team lead.
            {isOffline
              ? " Your position is recorded now: stay at the business."
              : ""}
          </p>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => goTo(4)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || !ownerVerified}
            >
              {pending ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={withdraw}
          disabled={pending}
        >
          Withdraw this onboarding
        </Button>
      </div>
    </div>
  );
}
