import ModalShell from "@/components/atoms/ModalShell";
import TicketStatusBadge from "@/components/atoms/TicketStatusBadge";
import { useToast } from "@/hooks/useToast";
import { loadTicketPdfFontInBrowser } from "@/utils/ticketPdfFont";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  formatDateWithSuffix,
  getFormattedEventDate,
} from "@abonten/core/dateFormatter";
import { SHIMMER_BLUR_DATA_URL } from "@abonten/core/imagePlaceholder";
import {
  buildTicketPdfData,
  buildTicketPdfFilename,
  ticketPdfLabels,
} from "@abonten/core/ticketPdfData";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type { UserTicketType } from "@abonten/types/ticketType";
import { pdf } from "@react-pdf/renderer";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { IoChevronBackSharp } from "react-icons/io5";
import { Button } from "../ui/button";
import TicketPdfDocument from "./TicketPdfDocument";

type ReceiptButtonProp = {
  handleShowTicket: (state: boolean) => void;
  event: UserTicketType;
};

export default function TicketModal({
  handleShowTicket,
  event,
}: ReceiptButtonProp) {
  const locale = useLocale();

  const t = useTranslations("common");
  const tc = useTranslations("core");
  const tt = useTranslations("tickets");
  const toast = useToast();

  const handleDOwnloadPdf = async () => {
    try {
      await downloadPdf();
    } catch {
      // Before this, a failed download did nothing at all: the button
      // simply never answered.
      toast.error(tt("somethingWentWrongGeneratingThePdf"));
    }
  };

  const downloadPdf = async () => {
    // Same TicketPdfDocument the purchase-confirmation email attaches
    // server-side — this is the one canonical ticket PDF, just generated
    // client-side here instead of via renderToBuffer.
    // The words are worked out here, where the page's language is known:
    // the PDF renderer runs outside the page and cannot read it.
    const data = buildTicketPdfData(event, undefined, locale);
    const font = await loadTicketPdfFontInBrowser();
    const blob = await pdf(
      <TicketPdfDocument
        ticket={data}
        labels={ticketPdfLabels(tc, data)}
        font={font}
      />,
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildTicketPdfFilename(event.ticket_code);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <ModalShell
      open
      onClose={() => handleShowTicket(false)}
      title={t("ticketReceipt", { title: event.event.title })}
    >
      <div className="w-full h-full bg-card text-card-foreground md:w-[60%] md:h-[90%] lg:w-[35%] md:rounded-xl p-3 space-y-5 overflow-y-scroll">
        <button
          type="button"
          onClick={() => handleShowTicket(false)}
          className="flex items-center gap-1 text-muted-foreground font-medium hover:text-foreground transition mb-6"
        >
          <IoChevronBackSharp className="text-2xl" />
          {t("back")}
        </button>

        <div className="pdf-content p-2">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold tracking-wide mb-1">
              {t("receipt")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("issuedOn", {
                formatDateWithSuffix: formatDateWithSuffix(
                  event.issued_at,
                  undefined,
                  locale,
                ),
              })}
            </p>
          </div>

          <div className="bg-muted rounded-2xl overflow-hidden border border-border">
            <div className="relative h-56 w-full">
              <Image
                src={buildCloudinaryUrl(
                  event.event.flyer_public_id,
                  event.event.flyer_version,
                  { width: 500, height: 224 },
                )}
                alt={event.event.title}
                fill
                className="object-cover rounded-t-2xl"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 60vw, 35vw"
                placeholder="blur"
                blurDataURL={SHIMMER_BLUR_DATA_URL}
              />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/events/${event.event.event_code.toLowerCase()}`}
                  className="text-xl font-semibold mb-2"
                >
                  {event.event.title}
                </Link>

                <TicketStatusBadge
                  status={event.status}
                  cancelledByOrganizer={event.event.status === "canceled"}
                />
              </div>

              <p className="text-sm text-muted-foreground mb-2 font-bold">
                {t("ticketType")}
                <span className="font-mono text-foreground">
                  {ticketTypeLabel(tc, event.ticket_type.type)}
                </span>
              </p>

              <p className="text-sm text-muted-foreground mb-2">
                {t("ticketCode")}
                <span className="font-mono text-foreground">
                  {event.ticket_code}
                </span>
              </p>

              <p className="text-sm text-muted-foreground mb-4">
                {t("location2", {
                  full_address: event.event.address.full_address,
                })}
              </p>

              <p className="text-sm text-muted-foreground mb-4">
                {t("date2", {
                  date: getFormattedEventDate(
                    event.event.starts_at,
                    event.event.ends_at,
                    event.event.occurrences,
                    event.event.timezone,
                    locale,
                  ).date,
                })}
              </p>

              <div className="mt-4 flex justify-center">
                <div className="relative h-56 w-56 border border-border">
                  <Image
                    src={buildCloudinaryUrl(
                      event.qr_public_id,
                      event.qr_version,
                      {
                        width: 224,
                        height: 224,
                        lossless: true,
                      },
                    )}
                    alt={event.event.title}
                    fill
                    className="object-contain"
                    sizes="224px"
                  />
                </div>
              </div>

              <p className="text-xs text-right mt-5">www.abontenhub.com</p>
            </div>
          </div>
        </div>

        <Button
          onClick={handleDOwnloadPdf}
          className="w-full rounded-lg p-6 font-bold"
        >
          {t("downloadAsPdf")}
        </Button>
      </div>
    </ModalShell>
  );
}
