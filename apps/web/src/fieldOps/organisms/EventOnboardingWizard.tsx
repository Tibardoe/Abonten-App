"use client";

import { submitFieldOpsEventOnboarding } from "@/actions/fieldOps/submitFieldOpsEventOnboarding";
import { withdrawFieldOpsOnboarding } from "@/actions/fieldOps/withdrawFieldOpsOnboarding";
import getEventFlyerUploadSignature from "@/actions/getEventFlyerUploadSignature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OwnerVerificationStep from "@/fieldOps/molecules/OwnerVerificationStep";
import { useToast } from "@/hooks/useToast";
import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import type { FieldOpsOnboardingDraft } from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Onboarding an event. Shorter than the business wizard because an event
// has no opening hours, no gallery and no duplicate problem worth a whole
// step: what matters is the organiser, the date, and one flyer.
//
// The money waits until the event has actually run, which the submit
// confirmation says plainly so nobody expects it sooner.

const STEPS = ["Organiser", "The event", "Flyer"] as const;

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
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  });
}

/** `datetime-local` gives no zone; treat it as the device's own time. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

export default function EventOnboardingWizard({
  campaignId,
  draft,
  isOffline,
}: {
  campaignId: string;
  draft: FieldOpsOnboardingDraft;
  isOffline: boolean;
}) {
  const o = draft.onboarding;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(1);
  const [ownerVerified, setOwnerVerified] = useState(o.ownerVerified);
  const [ownerName, setOwnerName] = useState(o.ownerFullName ?? "");
  const [ownerPhone, setOwnerPhone] = useState("");

  const [title, setTitle] = useState(o.businessName ?? "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(
    eventCategoriesAndTypes[0]?.category ?? "",
  );
  const [type, setType] = useState(eventCategoriesAndTypes[0]?.types[0] ?? "");
  const [address, setAddress] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [freeEvent, setFreeEvent] = useState(true);
  const [price, setPrice] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [flyer, setFlyer] = useState<{
    publicId: string;
    version: string;
  } | null>(null);

  const usePin = () =>
    start(async () => {
      try {
        const p = await currentPosition();
        setPin({ lat: p.lat, lng: p.lng });
        toast.success("Location set from where you are.");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const uploadFlyer = (file: File) =>
    start(async () => {
      if (file.size > MAX_EVENT_FLYER_SIZE_BYTES) {
        toast.error("That flyer is too large.");
        return;
      }
      const sig = await getEventFlyerUploadSignature();
      if (sig.status !== 200 || !sig.data) {
        toast.error(sig.message ?? "Couldn't start the upload.");
        return;
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
        const up = await promise;
        setFlyer({ publicId: up.public_id, version: String(up.version) });
        toast.success("Flyer uploaded.");
      } catch {
        toast.error("The flyer didn't upload. Try again.");
      }
    });

  const withdraw = () =>
    start(async () => {
      const res = await withdrawFieldOpsOnboarding({
        campaignId,
        onboardingId: o.id,
        reason: "Not going ahead",
      });
      if (res.status === 200) {
        toast.success("Withdrawn.");
        router.push("/field/submissions");
      } else toast.error(res.message ?? "Couldn't withdraw.");
    });

  const submit = () =>
    start(async () => {
      if (!pin || !flyer) {
        toast.error("Set the location and upload the flyer first.");
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
      const res = await submitFieldOpsEventOnboarding({
        campaignId,
        onboardingId: o.id,
        event: {
          title: title.trim(),
          description: description.trim(),
          category,
          types: [type],
          address: address.trim(),
          location: pin,
          startsAt: toIso(startsAt),
          endsAt: toIso(endsAt),
          capacity: capacity ? Number(capacity) : null,
          websiteUrl: null,
          requireRegistration: false,
          freeEvent,
          singleTicket: freeEvent
            ? null
            : { price: Number(price), quantity: null },
          flyer,
        },
        submissionLocation: here ? { lat: here.lat, lng: here.lng } : null,
        submissionAccuracyM: here?.accuracyM ?? null,
      });
      if (res.status === 200) {
        toast.success(res.message ?? "Submitted.");
        router.push(`/field/submissions/${o.id}`);
      } else {
        toast.error(res.message ?? "Couldn't submit.");
      }
    });

  const detailsReady =
    title.trim().length >= 3 &&
    description.trim().length >= 80 &&
    address.trim().length >= 3 &&
    Boolean(startsAt) &&
    Boolean(endsAt) &&
    new Date(endsAt) > new Date(startsAt) &&
    Boolean(pin) &&
    Boolean(type) &&
    (freeEvent || Number(price) > 0);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-1 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              step === i + 1
                ? "bg-primary text-primary-foreground"
                : "border text-muted-foreground"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">The organiser</h2>
          <OwnerVerificationStep
            campaignId={campaignId}
            onboardingId={o.id}
            noun="organiser"
            verified={ownerVerified}
            onVerified={() => {
              setOwnerVerified(true);
              setStep(2);
            }}
            fullName={ownerName}
            phone={ownerPhone}
            onFullName={setOwnerName}
            onPhone={setOwnerPhone}
          />
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={withdraw}>
              Withdraw
            </Button>
            <Button
              type="button"
              onClick={() => setStep(2)}
              disabled={!ownerVerified}
            >
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">The event</h2>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-title">Name of the event</Label>
            <Input
              id="e-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-desc">What happens there</Label>
            <Textarea
              id="e-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
            />
            <p className="text-xs text-muted-foreground">
              {description.trim().length}/80 characters minimum
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-cat">Kind of event</Label>
              <select
                id="e-cat"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={(e) => {
                  const next = e.target.value;
                  setCategory(next);
                  setType(
                    eventCategoriesAndTypes.find((c) => c.category === next)
                      ?.types[0] ?? "",
                  );
                }}
              >
                {eventCategoriesAndTypes.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-type">More precisely</Label>
              <select
                id="e-type"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {(
                  eventCategoriesAndTypes.find((c) => c.category === category)
                    ?.types ?? []
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-cap">How many people (optional)</Label>
              <Input
                id="e-cap"
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-start">Starts</Label>
              <Input
                id="e-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-end">Ends</Label>
              <Input
                id="e-end"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-addr">Where</Label>
            <Input
              id="e-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={usePin}>
              {pin ? "Update the pin" : "Set the location"}
            </Button>
            {pin ? (
              <span className="text-xs text-muted-foreground">
                {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </span>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={freeEvent}
              onChange={(e) => setFreeEvent(e.target.checked)}
            />
            Free to attend
          </label>
          {!freeEvent ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-price">Ticket price (GH&#8373;)</Label>
              <Input
                id="e-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          ) : null}
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(3)}
              disabled={!detailsReady}
            >
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">Flyer</h2>
          <p className="text-sm text-muted-foreground">
            One clear photo of the flyer or poster. This is what people see in
            the app.
          </p>
          {flyer ? (
            <img
              src={buildCloudinaryUrl(flyer.publicId, flyer.version, {
                width: 600,
              })}
              alt="The event flyer"
              className="max-h-72 w-auto rounded-lg border object-contain"
            />
          ) : null}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFlyer(f);
            }}
            className="text-sm"
          />

          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            The event will be listed under the organiser straight away. Your
            commission is confirmed after the event has actually taken place
            &mdash; not before.
          </p>

          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || !flyer || !detailsReady || !ownerVerified}
            >
              {pending ? "Sending…" : "Submit for review"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
