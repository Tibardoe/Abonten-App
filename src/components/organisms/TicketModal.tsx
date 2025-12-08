import type { UserTicketType } from "@/types/ticketType";
import {
  formatDateWithSuffix,
  getFormattedEventDate,
} from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { useRef } from "react";
import { IoChevronBackSharp } from "react-icons/io5";
import { Button } from "../ui/button";

type ReceiptButtonProp = {
  handleShowTicket: (state: boolean) => void;
  event: UserTicketType;
};

export default function TicketModal({
  handleShowTicket,
  event,
}: ReceiptButtonProp) {
  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const pdfRef = useRef<HTMLDivElement>(null); // This ref will now point to the printable area

  const handleDOwnloadPdf = async () => {
    if (!pdfRef.current) return;

    const canvas = await html2canvas(pdfRef.current, { scale: 2 }); // Increase scale for better quality
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Calculate the dimensions to fit the image while maintaining aspect ratio
    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = imgProps.width;
    const imgHeight = imgProps.height;

    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);

    const scaledWidth = imgWidth * ratio;
    const scaledHeight = imgHeight * ratio;

    // Center the image on the page
    const x = (pdfWidth - scaledWidth) / 2;
    const y = (pdfHeight - scaledHeight) / 2;

    pdf.addImage(imgData, "PNG", x, y, scaledWidth, scaledHeight);
    pdf.save("ticket_receipt.pdf");
  };

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-black bg-opacity-50 flex justify-center items-center z-30">
      <div className="w-full h-full bg-white md:w-[60%] md:h-[90%] lg:w-[35%] md:rounded-xl p-3 space-y-5 overflow-y-scroll">
        <button
          type="button"
          onClick={() => handleShowTicket(false)}
          className="flex items-center gap-1 text-gray-600 font-medium hover:text-black transition mb-6"
        >
          <IoChevronBackSharp className="text-2xl" />
          Back
        </button>

        {/* This is the new div that contains only the content for the PDF */}
        <div ref={pdfRef} className="pdf-content p-2">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold tracking-wide mb-1">Receipt</h1>
            <p className="text-gray-500 text-sm">
              Issued on: {formatDateWithSuffix(event.issued_at)}
            </p>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
            <div className="relative h-56 w-full">
              <Image
                src={`${cloudinaryBaseUrl}v${event.event.flyer_version}/${event.event.flyer_public_id}.jpg`}
                alt={event.event.title}
                layout="fill"
                objectFit="cover"
                className="rounded-t-2xl"
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <Link
                  href={`/events/${generateSlug(
                    event.event.address.full_address,
                  )}/event/${event.event.slug}`}
                  className="text-xl font-semibold mb-2"
                >
                  {event.event.title}
                </Link>

                <p className="text-sm text-gray-600 mb-2 font-bold">
                  Ticket Type:{" "}
                  <span className="font-mono text-gray-800">
                    {event.ticket_type.type}
                  </span>
                </p>
              </div>

              <p className="text-sm text-gray-600 mb-2">
                Ticket Code:{" "}
                <span className="font-mono text-gray-800">
                  {event.ticket_code}
                </span>
              </p>
              <p className="text-sm text-gray-500 mb-2">
                Status:{" "}
                {event.status === "active" ? (
                  <span className="font-semibold text-green-600">
                    {event.status}
                  </span>
                ) : (
                  <span className="font-semibold text-red-600">
                    {event.status}
                  </span>
                )}
              </p>

              <p className="text-sm text-gray-500 mb-4">
                Location: {event.event.address.full_address}
              </p>

              <p className="text-sm text-gray-500 mb-4">
                Date:{" "}
                {
                  getFormattedEventDate(
                    event.event.starts_at,
                    event.event.ends_at,
                    event.event.event_dates,
                  ).date
                }
              </p>

              <div className="mt-4 flex justify-center">
                <div className="relative h-56 w-56 border">
                  <Image
                    src={`${cloudinaryBaseUrl}v${event.qr_version}/${event.qr_public_id}.jpg`}
                    alt={event.event.title}
                    layout="fill"
                    objectFit="contain"
                  />
                </div>
              </div>

              <p className="text-xs text-right mt-5">www.abontenhub.com</p>
            </div>
          </div>
        </div>

        <Button
          onClick={handleDOwnloadPdf}
          className="w-full rounded-lg p-6 font-bold bg-mint"
        >
          Download As PDF
        </Button>
      </div>
    </div>
  );
}
