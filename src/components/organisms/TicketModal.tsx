import ModalShell from "@/components/atoms/ModalShell";
import TicketStatusBadge from "@/components/atoms/TicketStatusBadge";
import type { UserTicketType } from "@/types/ticketType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import {
  formatDateWithSuffix,
  getFormattedEventDate,
} from "@/utils/dateFormatter";
import { SHIMMER_BLUR_DATA_URL } from "@/utils/imagePlaceholder";
import {
  buildTicketPdfData,
  buildTicketPdfFilename,
} from "@/utils/ticketPdfData";
import { pdf } from "@react-pdf/renderer";
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
  const handleDOwnloadPdf = async () => {
    // Same TicketPdfDocument the purchase-confirmation email attaches
    // server-side — this is the one canonical ticket PDF, just generated
    // client-side here instead of via renderToBuffer.
    const blob = await pdf(
      <TicketPdfDocument ticket={buildTicketPdfData(event)} />,
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
      title={`Ticket receipt — ${event.event.title}`}
    >
      <div className="w-full h-full bg-card text-card-foreground md:w-[60%] md:h-[90%] lg:w-[35%] md:rounded-xl p-3 space-y-5 overflow-y-scroll">
        <button
          type="button"
          onClick={() => handleShowTicket(false)}
          className="flex items-center gap-1 text-muted-foreground font-medium hover:text-foreground transition mb-6"
        >
          <IoChevronBackSharp className="text-2xl" />
          Back
        </button>

        <div className="pdf-content p-2">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold tracking-wide mb-1">Receipt</h1>
            <p className="text-muted-foreground text-sm">
              Issued on: {formatDateWithSuffix(event.issued_at)}
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
                Ticket Type:{" "}
                <span className="font-mono text-foreground">
                  {event.ticket_type.type}
                </span>
              </p>

              <p className="text-sm text-muted-foreground mb-2">
                Ticket Code:{" "}
                <span className="font-mono text-foreground">
                  {event.ticket_code}
                </span>
              </p>

              <p className="text-sm text-muted-foreground mb-4">
                Location: {event.event.address.full_address}
              </p>

              <p className="text-sm text-muted-foreground mb-4">
                Date:{" "}
                {
                  getFormattedEventDate(
                    event.event.starts_at,
                    event.event.ends_at,
                    event.event.occurrences,
                  ).date
                }
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
          Download As PDF
        </Button>
      </div>
    </ModalShell>
  );
}
