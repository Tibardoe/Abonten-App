import type { TicketCancelQuote } from "@abonten/types/ticketType";
import { describe, expect, it } from "vitest";
import type { CoreTranslator } from "./i18n/translator";
import { getRefundStatusKind, ticketRefundState } from "./refundStatus";
import { eventCancelDialog, ticketCancelDialog } from "./ticketCancelQuote";

// Echoes the key and its values, so the test reads which sentence was
// picked and what it was given.
const t: CoreTranslator = (key, values) =>
  values ? `${key}${JSON.stringify(values)}` : key;
const i18n = { locale: "en", t };

const paid: TicketCancelQuote = {
  paid: true,
  otherTicketIds: [],
  keptTicketCount: 0,
  eventTicketCount: 1,
  otherEvents: false,
  checkedIn: false,
  refund: { cashMinor: 4000, creditMinor: 0, currency: "GHS" },
};

describe("ticketCancelDialog", () => {
  it("a free ticket gives nothing back", () => {
    const dialog = ticketCancelDialog(i18n, {
      ...paid,
      paid: false,
      refund: null,
    });
    expect(dialog).toMatchObject({
      body: "ticketCancel.free",
      confirm: "ticketCancel.confirmOne",
      wholePayment: false,
    });
  });

  it("names the amount and where it goes", () => {
    expect(ticketCancelDialog(i18n, paid).body).toBe(
      'ticketCancel.refundCash{"amount":"GH₵40.00"}',
    );
    expect(
      ticketCancelDialog(i18n, {
        ...paid,
        refund: { cashMinor: 0, creditMinor: 4000, currency: "GHS" },
      }).body,
    ).toBe('ticketCancel.refundCredit{"amount":"GH₵40.00"}');
    expect(
      ticketCancelDialog(i18n, {
        ...paid,
        refund: { cashMinor: 3000, creditMinor: 1000, currency: "GHS" },
      }).body,
    ).toBe('ticketCancel.refundBoth{"cash":"GH₵30.00","credit":"GH₵10.00"}');
    expect(ticketCancelDialog(i18n, { ...paid, refund: null }).body).toBe(
      "ticketCancel.refundUnknown",
    );
  });

  it("one ticket of a cash payment goes alone; the others stay valid", () => {
    const dialog = ticketCancelDialog(i18n, { ...paid, keptTicketCount: 2 });
    expect(dialog).toEqual({
      body: 'ticketCancel.refundCash{"amount":"GH₵40.00"} ticketCancel.othersStayValid{"count":2}',
      confirm: "ticketCancel.confirmOne",
      keep: "ticketCancel.keepOne",
      wholePayment: false,
      allForEvent: null,
    });
  });

  it("offers every ticket for the event when there are several", () => {
    expect(
      ticketCancelDialog(i18n, { ...paid, eventTicketCount: 3 }).allForEvent,
    ).toBe('ticketCancel.cancelAllForEvent{"count":3}');
    const all = eventCancelDialog(i18n, {
      ticketIds: ["a", "b", "c"],
      paid: true,
      refund: { cashMinor: 12000, creditMinor: 0, currency: "GHS" },
      blocked: null,
    });
    expect(all).toEqual({
      title: "ticketCancel.eventTitle",
      body: 'ticketCancel.eventAll{"count":3} ticketCancel.refundCash{"amount":"GH₵120.00"}',
      confirm: 'ticketCancel.confirmEvent{"count":3}',
      keep: "ticketCancel.keepAll",
    });
    expect(
      eventCancelDialog(i18n, {
        ticketIds: ["a", "b"],
        paid: true,
        refund: null,
        blocked: "other_events",
      }).confirm,
    ).toBeNull();
  });

  it("a ticket paid for with others is cancelled with them", () => {
    const dialog = ticketCancelDialog(i18n, {
      ...paid,
      otherTicketIds: ["b"],
      refund: { cashMinor: 8000, creditMinor: 0, currency: "GHS" },
    });
    expect(dialog).toEqual({
      body: 'ticketCancel.together{"count":1} ticketCancel.refundCash{"amount":"GH₵80.00"}',
      confirm: 'ticketCancel.confirmAll{"count":2}',
      keep: "ticketCancel.keepAll",
      wholePayment: true,
      allForEvent: null,
    });
    expect(
      ticketCancelDialog(i18n, {
        ...paid,
        otherTicketIds: ["b", "c"],
        otherEvents: true,
      }).body,
    ).toMatch(/^ticketCancel\.togetherOtherEvents\{"count":2\}/);
  });

  it("offers no cancel once a ticket of the payment was checked in", () => {
    const dialog = ticketCancelDialog(i18n, {
      ...paid,
      otherTicketIds: ["b"],
      checkedIn: true,
    });
    expect(dialog.confirm).toBeNull();
    expect(dialog.body).toBe("ticketCancel.checkedIn");
  });
});

describe("ticketRefundState", () => {
  const payment = {
    status: "successful",
    refund_requested_at: null,
    amount: 157.5,
    currency: "GHS",
  };
  const part = (status: string, created_at: string, amount = 50) => ({
    refund: { status, amount, currency: "GHS", created_at },
  });

  it("reads the ticket's own refund, the latest when it was asked again", () => {
    expect(
      ticketRefundState({
        transaction: payment,
        refund_parts: [
          part("failed", "2026-10-30T10:00:00Z"),
          part("requested", "2026-10-30T11:00:00Z"),
        ],
      }),
    ).toEqual({
      status: "refund_pending",
      refundRequestedAt: "2026-10-30T11:00:00Z",
      amount: 50,
      currency: "GHS",
    });
    expect(
      ticketRefundState({
        transaction: payment,
        refund_parts: [part("processed", "2026-10-30T10:00:00Z")],
      })?.status,
    ).toBe("refunded");
    // A refused part reads as a failed refund (successful + requested).
    const failed = ticketRefundState({
      transaction: payment,
      refund_parts: [part("failed", "2026-10-30T10:00:00Z")],
    });
    expect(
      failed && getRefundStatusKind(failed.status, failed.refundRequestedAt),
    ).toBe("failed");
  });

  it("falls back to the payment without a refund of its own", () => {
    expect(
      ticketRefundState({ transaction: payment, refund_parts: [] }),
    ).toEqual({
      status: "successful",
      refundRequestedAt: null,
      amount: 157.5,
      currency: "GHS",
    });
    expect(ticketRefundState({ transaction: null })).toBeNull();
  });
});
