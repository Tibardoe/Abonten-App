"use client";

import { submitFieldOpsEventOnboarding } from "@/actions/fieldOps/submitFieldOpsEventOnboarding";
import { withdrawFieldOpsOnboarding } from "@/actions/fieldOps/withdrawFieldOpsOnboarding";
import getEventFlyerUploadSignature from "@/actions/getEventFlyerUploadSignature";
import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OwnerVerificationStep from "@/fieldOps/molecules/OwnerVerificationStep";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import {
  eventCategoryLabel,
  eventTypeLabel,
} from "@abonten/core/categoryLabels";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import type { FieldOpsOnboardingDraft } from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

// Onboarding an event. Shorter than the business wizard because an event
// has no opening hours, no gallery and no duplicate problem worth a whole
// step: what matters is the organiser, the date, and one flyer.
//
// The money waits until the event has actually run, which the submit
// confirmation says plainly so nobody expects it sooner.

const STEPS = ["organiser", "theEvent", "flyer"] as const;

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
  const t = useTranslations("fieldOps");
  const tc = useTranslations("core");

  const o = draft.onboarding;
  const toast = useToast();
  const confirm = useConfirm();
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
  // One row per date: a single start and end, or several days (a festival,
  // a weekly night) that become the event's dates.
  const rowId = useRef(0);
  const nextId = () => {
    rowId.current += 1;
    return rowId.current;
  };
  const [dates, setDates] = useState([{ id: 0, start: "", end: "" }]);
  const [capacity, setCapacity] = useState("");
  const [freeEvent, setFreeEvent] = useState(true);
  // A free event can take registrations (a free QR ticket each, so the
  // organiser sees who is coming and checks them in) or just be open.
  // On by default: it is what the outreach messages offer organisers.
  const [requireRegistration, setRequireRegistration] = useState(true);
  // One price, or several named ticket types (Early bird, Regular, VIP).
  const [tiers, setTiers] = useState([
    { id: 0, name: "", price: "", quantity: "" },
  ]);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [flyer, setFlyer] = useState<{
    publicId: string;
    version: string;
  } | null>(null);

  // Not named use…: it is a click handler, and the old name let a hook be
  // called inside it (React threw on every click of "Set the location").
  const pinFromHere = () =>
    start(async () => {
      try {
        const p = await currentPosition();
        setPin({ lat: p.lat, lng: p.lng });
        toast.success(t("locationSetFromWhereYouAre"));
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const uploadFlyer = (file: File) =>
    start(async () => {
      if (file.size > MAX_EVENT_FLYER_SIZE_BYTES) {
        toast.error(t("thatFlyerIsTooLarge"));
        return;
      }
      const sig = await getEventFlyerUploadSignature().catch(actionUnreachable);
      if (sig.status !== 200 || !sig.data) {
        toast.error(sig.message ?? t("couldnTStartTheUpload"));
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
        toast.success(t("flyerUploaded"));
      } catch {
        toast.error(t("theFlyerDidnTUploadTry"));
      }
    });

  // The place wizard asked before withdrawing; this one withdrew on the
  // first click of a button that sits beside "Next".
  const withdraw = async () => {
    const confirmed = await confirm({
      title: t("withdrawOnboardingTitle"),
      message: t("withdrawOnboardingBody"),
      confirmLabel: t("withdraw"),
      cancelLabel: t("keepIt"),
    });
    if (!confirmed) return;
    start(async () => {
      const res = await withdrawFieldOpsOnboarding({
        campaignId,
        onboardingId: o.id,
        reason: t("notGoingAhead"),
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(t("withdrawn"));
        router.push("/field/submissions");
      } else toast.error(res.message ?? t("couldnTWithdraw"));
    });
  };

  const submit = () =>
    start(async () => {
      if (!pin || !flyer) {
        toast.error(t("setTheLocationAndUploadThe"));
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
          startsAt: toIso(dates[0].start),
          endsAt: toIso(dates[0].end),
          specificDates:
            dates.length > 1
              ? dates.map((d) => ({
                  startsAt: toIso(d.start),
                  endsAt: toIso(d.end),
                }))
              : null,
          capacity: capacity ? Number(capacity) : null,
          websiteUrl: null,
          requireRegistration: freeEvent && requireRegistration,
          freeEvent,
          singleTicket:
            freeEvent || tiers.length > 1
              ? null
              : {
                  price: Number(tiers[0].price),
                  quantity: tiers[0].quantity
                    ? Number(tiers[0].quantity)
                    : null,
                },
          multipleTickets:
            !freeEvent && tiers.length > 1
              ? tiers.map((tier) => ({
                  type: tier.name.trim(),
                  price: Number(tier.price),
                  quantity: tier.quantity ? Number(tier.quantity) : null,
                }))
              : null,
          flyer,
        },
        submissionLocation: here ? { lat: here.lat, lng: here.lng } : null,
        submissionAccuracyM: here?.accuracyM ?? null,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message ?? t("submitted2"));
        router.push(`/field/submissions/${o.id}`);
      } else {
        toast.error(res.message ?? t("couldnTSubmit"));
      }
    });

  const datesReady = dates.every(
    (d) => d.start && d.end && new Date(d.end) > new Date(d.start),
  );
  const ticketsReady =
    freeEvent ||
    tiers.every(
      (tier) =>
        Number(tier.price) > 0 &&
        (tiers.length === 1 || tier.name.trim().length > 0),
    );
  const detailsReady =
    title.trim().length >= 3 &&
    description.trim().length >= 80 &&
    address.trim().length >= 3 &&
    datesReady &&
    Boolean(pin) &&
    Boolean(type) &&
    ticketsReady;

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
            {i + 1}. {t(label)}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">{t("theOrganiser")}</h2>
          <OwnerVerificationStep
            campaignId={campaignId}
            onboardingId={o.id}
            party="organiser"
            verified={ownerVerified}
            onVerified={() => {
              setOwnerVerified(true);
              setStep(2);
            }}
            fullName={ownerName}
            phone={ownerPhone}
            onFullName={setOwnerName}
            onPhone={setOwnerPhone}
            dialCode={draft.dialCode}
            codeSent={Boolean(o.ownerPhoneMasked) && !o.ownerVerified}
            initialConsentPath={draft.ownerOtp.consentPath}
          />
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={withdraw}>
              {t("withdraw")}
            </Button>
            <Button
              type="button"
              onClick={() => setStep(2)}
              disabled={!ownerVerified}
            >
              {t("next")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">{t("theEvent")}</h2>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-title">{t("nameOfTheEvent")}</Label>
            <Input
              id="e-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-desc">{t("whatHappensThere")}</Label>
            <Textarea
              id="e-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
            />
            <p className="text-xs text-muted-foreground">
              {t("n80CharactersMinimum", { length: description.trim().length })}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-cat">{t("kindOfEvent")}</Label>
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
                    {eventCategoryLabel(tc, c.category)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-type">{t("morePrecisely")}</Label>
              <select
                id="e-type"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {(
                  eventCategoriesAndTypes.find((c) => c.category === category)
                    ?.types ?? []
                ).map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventTypeLabel(tc, eventType)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="e-cap">{t("howManyPeopleOptional")}</Label>
              <Input
                id="e-cap"
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {dates.map((d, i) => {
              const startId = i === 0 ? "e-start" : `e-start-${d.id}`;
              const endId = i === 0 ? "e-end" : `e-end-${d.id}`;
              const setRow = (patch: { start?: string; end?: string }) =>
                setDates((rows) =>
                  rows.map((r) => (r.id === d.id ? { ...r, ...patch } : r)),
                );
              return (
                <div key={d.id} className="flex flex-col gap-2">
                  {dates.length > 1 ? (
                    <p className="text-sm font-medium">
                      {t("dateNumber", { number: i + 1 })}
                    </p>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={startId}>{t("starts")}</Label>
                      <Input
                        id={startId}
                        type="datetime-local"
                        value={d.start}
                        onChange={(e) => setRow({ start: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={endId}>{t("ends")}</Label>
                      <Input
                        id={endId}
                        type="datetime-local"
                        value={d.end}
                        onChange={(e) => setRow({ end: e.target.value })}
                      />
                    </div>
                  </div>
                  {i > 0 ? (
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDates((rows) => rows.filter((r) => r.id !== d.id))
                        }
                      >
                        {t("removeThisDate")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDates((rows) => [
                    ...rows,
                    { id: nextId(), start: "", end: "" },
                  ])
                }
                disabled={dates.length >= 30}
              >
                {t("addAnotherDate")}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t("where")}</Label>
            {/* Search sets the pin from the venue itself, which is the only
                way an online member (working by phone, not at the venue)
                can place it. "Use where I am" stays for in-person work. */}
            <PostAutoComplete
              address={{ address: setAddress }}
              onSelectCoordinates={(loc) =>
                setPin({ lat: loc.lat, lng: loc.lng })
              }
              placeholderText={{
                text: t("searchForTheVenue"),
                svgUrl: "/assets/images/location.svg",
              }}
            />
          </div>
          {/* The search fills this with the place's name; the member can add
              what helps people find it ("opposite the DVLA head office"). It
              is what the listing shows; the pin stays where the search put it. */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="e-addr">{t("addressShownOnTheListing")}</Label>
            <Input
              id="e-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isOffline ? (
              <Button type="button" variant="outline" onClick={pinFromHere}>
                {pin ? t("updateThePin") : t("setTheLocation")}
              </Button>
            ) : null}
            {pin ? (
              <span className="text-xs text-muted-foreground">
                {t("pinAt", {
                  toFixed: pin.lat.toFixed(5),
                  toFixed2: pin.lng.toFixed(5),
                })}
              </span>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={freeEvent}
              onChange={(e) => setFreeEvent(e.target.checked)}
            />
            {t("freeToAttend")}
          </label>
          {freeEvent ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireRegistration}
                onChange={(e) => setRequireRegistration(e.target.checked)}
              />
              {t("peopleRegisterForAFreeTicket")}
            </label>
          ) : null}
          {!freeEvent ? (
            <div className="flex flex-col gap-3">
              {tiers.length > 1 ? (
                <p className="text-sm font-medium">{t("ticketTypes")}</p>
              ) : null}
              {tiers.map((tier, i) => {
                const setTier = (patch: {
                  name?: string;
                  price?: string;
                  quantity?: string;
                }) =>
                  setTiers((rows) =>
                    rows.map((r) =>
                      r.id === tier.id ? { ...r, ...patch } : r,
                    ),
                  );
                const priceId = i === 0 ? "e-price" : `e-price-${tier.id}`;
                return (
                  <div
                    key={tier.id}
                    className="grid gap-3 rounded-md md:grid-cols-3"
                  >
                    {tiers.length > 1 ? (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`e-tier-${tier.id}`}>
                          {t("ticketTypeName")}
                        </Label>
                        <Input
                          id={`e-tier-${tier.id}`}
                          value={tier.name}
                          placeholder={t("ticketTypeNamePlaceholder")}
                          onChange={(e) => setTier({ name: e.target.value })}
                          maxLength={60}
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={priceId}>{t("ticketPriceGh")}</Label>
                      <Input
                        id={priceId}
                        inputMode="decimal"
                        value={tier.price}
                        onChange={(e) => setTier({ price: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`e-qty-${tier.id}`}>
                        {t("ticketQuantityOptional")}
                      </Label>
                      <Input
                        id={`e-qty-${tier.id}`}
                        inputMode="numeric"
                        value={tier.quantity}
                        onChange={(e) =>
                          setTier({
                            quantity: e.target.value.replace(/\D/g, ""),
                          })
                        }
                      />
                    </div>
                    {i > 0 ? (
                      <div className="md:col-span-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setTiers((rows) =>
                              rows.filter((r) => r.id !== tier.id),
                            )
                          }
                        >
                          {t("removeThisTicketType")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTiers((rows) => [
                      ...rows,
                      { id: nextId(), name: "", price: "", quantity: "" },
                    ])
                  }
                  disabled={tiers.length >= 10}
                >
                  {t("addAnotherTicketType")}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              {t("back")}
            </Button>
            <Button
              type="button"
              onClick={() => setStep(3)}
              disabled={!detailsReady}
            >
              {t("next")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">{t("flyer")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("oneClearPhotoOfTheFlyer")}
          </p>
          {flyer ? (
            <img
              src={buildCloudinaryUrl(flyer.publicId, flyer.version, {
                width: 600,
              })}
              alt={t("theEventFlyer")}
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
            {t("theEventWillBeListedUnder")}
          </p>

          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(2)}>
              {t("back")}
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending || !flyer || !detailsReady || !ownerVerified}
            >
              {pending ? t("sending") : t("submitForReview")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
