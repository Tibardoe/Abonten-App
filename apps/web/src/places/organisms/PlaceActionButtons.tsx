"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import GetDirectionBtn from "@/components/atoms/GetDirectionBtn";
import { MessageSubjectButton } from "@/messaging/components/MessageSubjectButton";
import ClaimPlaceButton from "@/places/molecules/ClaimPlaceButton";
import RequestBookingButton from "@/places/molecules/RequestBookingButton";
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { PlaceClaimOwnerRef } from "@abonten/core/placeClaimInvite";
import { useTranslations } from "next-intl";
import { FiPhone } from "react-icons/fi";
import { IoLogoWhatsapp } from "react-icons/io5";

type BookingService = {
  id: string;
  name: string;
};

type PlaceActionButtonsProps = {
  placeId: string;
  placeName: string;
  ownerId: string;
  /**
   * False when the owner's account was deleted (placeHasOwner): nobody
   * would read a message or a booking request, so the claim path takes
   * their place.
   */
  hasOwner: boolean;
  claimed: boolean | null | undefined;
  owner: PlaceClaimOwnerRef;
  location: string;
  phone: string | null;
  whatsapp: string | null;
  services: BookingService[];
};

// Primary, essential actions, per the Places spec -- Directions, Book
// (Places Phase 2, Milestone 4 -- "Book, if enabled" was always meant to go
// here per the original Phase 1 spec, just not built until now), Call,
// WhatsApp. Each click logs analytics fire-and-forget (never awaited, never
// blocks navigation/the tel:/wa.me link) via logPlaceEngagement --
// RequestBookingButton gates its own visibility (signed-in, non-owner) and
// opens a modal rather than navigating, so it has no engagement click to log
// here.
export default function PlaceActionButtons({
  placeId,
  placeName,
  ownerId,
  hasOwner,
  claimed,
  owner,
  location,
  phone,
  whatsapp,
  services,
}: PlaceActionButtonsProps) {
  const t = useTranslations("places");

  const whatsappDigits = whatsapp?.replace(/\D/g, "");

  return (
    <div className="space-y-3">
      {hasOwner ? null : (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("noOwnerTitle")}
            </p>
            <p className="text-sm text-muted-foreground">{t("noOwnerBody")}</p>
          </div>
          <ClaimPlaceButton
            placeId={placeId}
            placeName={placeName}
            ownerId={ownerId}
            claimed={claimed}
            owner={owner}
            variant="inline"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/*
          biome-ignore lint/a11y/useKeyWithClickEvents: this div only wraps
          GetDirectionBtn's own <button> (already fully keyboard-accessible)
          to piggyback an analytics click via bubbling, without modifying
          GetDirectionBtn.tsx itself (reused as-is, per the Places spec).
        */}
        <div
          onClick={() =>
            logPlaceEngagement(placeId, "direction_click").catch(
              actionUnreachable,
            )
          }
        >
          <GetDirectionBtn location={location} />
        </div>

        {hasOwner ? (
          <>
            <RequestBookingButton
              placeId={placeId}
              placeName={placeName}
              ownerId={ownerId}
              services={services}
            />

            <MessageSubjectButton
              input={{ type: "place", placeId }}
              ownerId={ownerId}
              label={t("message")}
              className="w-full"
            />
          </>
        ) : null}

        {phone && (
          <a
            href={`tel:${phone}`}
            onClick={() =>
              logPlaceEngagement(placeId, "phone_click").catch(
                actionUnreachable,
              )
            }
            className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 md:py-3 rounded-lg transition-colors text-sm md:text-base"
          >
            <FiPhone /> {t("call")}
          </a>
        )}

        {whatsapp && (
          <a
            href={`https://wa.me/${whatsappDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              logPlaceEngagement(placeId, "whatsapp_click").catch(
                actionUnreachable,
              )
            }
            className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 md:py-3 rounded-lg transition-colors text-sm md:text-base"
          >
            <IoLogoWhatsapp /> WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
