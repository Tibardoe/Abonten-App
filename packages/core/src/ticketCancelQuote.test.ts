import type { TicketCancelQuote } from "@abonten/types/ticketType";
import { describe, expect, it } from "vitest";
import type { CoreTranslator } from "./i18n/translator";
import { ticketCancelDialog } from "./ticketCancelQuote";

// Echoes the key and its values, so the test reads which sentence was
// picked and what it was given.
const t: CoreTranslator = (key, values) =>
  values ? `${key}${JSON.stringify(values)}` : key;
const i18n = { locale: "en", t };

const paid: TicketCancelQuote = {
  paid: true,
  otherTicketIds: [],
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
