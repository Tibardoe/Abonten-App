import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The database side (RLS, the refund pipeline itself) is the integration
// suite's job. This pins the orchestration rule that a UI check alone can't
// enforce: a ticket that has been scanned in at the door must never be
// cancellable, because cancelling it refunds someone who attended and hands
// their seat back to inventory. The attendee list hides "Cancel" once a
// ticket is checked in, but POST /api/mobile/tickets/cancel is callable
// directly — before the guard, that call returned 200 and cancelled it.

const releaseTicketQuantity = vi.fn(async () => undefined);
const releasePromoUsage = vi.fn(async () => undefined);
const issueRefundCore = vi.fn(async () => ({ status: 200, message: "ok" }));
const serviceFrom = vi.fn();

vi.mock("@abonten/services/checkout/ticketInventory", () => ({
  releaseTicketQuantity: (...args: unknown[]) =>
    releaseTicketQuantity(...(args as [])),
}));
vi.mock("@abonten/services/checkout/promoUsage", () => ({
  releasePromoUsage: (...args: unknown[]) => releasePromoUsage(...(args as [])),
}));
vi.mock("@abonten/services/organizer/issueRefundCore", () => ({
  issueRefundCore: (...args: unknown[]) => issueRefundCore(...(args as [])),
}));
vi.mock("../supabase/serviceClient", () => ({
  getSupabaseServiceClient: () => ({ from: serviceFrom }),
}));

const { cancelUserTicketCore } = await import("./cancelUserTicketCore");

const USER = "11111111-1111-1111-1111-111111111111";
const TICKET = "22222222-2222-2222-2222-222222222222";
const EVENT = "33333333-3333-3333-3333-333333333333";

/** The caller's own (RLS-scoped) client — only used for the initial read. */
function callerClient(status: string): SupabaseClient<Database> {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        status,
                        ticket_type_id: "tt-1",
                        ticket_checkout_id: "co-1",
                        ticket_type: {
                          event_id: EVENT,
                          event: { event_code: "ZQ6121" },
                        },
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  releaseTicketQuantity.mockClear();
  releasePromoUsage.mockClear();
  issueRefundCore.mockClear();
  serviceFrom.mockClear();
});

describe("cancelUserTicketCore", () => {
  it("refuses a ticket that has already been checked in", async () => {
    const result = await cancelUserTicketCore(
      callerClient("used"),
      USER,
      TICKET,
      "tx-1",
    );

    expect(result.status).toBe(409);
    expect(result.message).toBe(
      "This ticket has already been checked in and can no longer be cancelled.",
    );
  });

  it("never releases inventory or requests a refund for a used ticket", async () => {
    await cancelUserTicketCore(callerClient("used"), USER, TICKET, "tx-1");

    expect(releaseTicketQuantity).not.toHaveBeenCalled();
    expect(releasePromoUsage).not.toHaveBeenCalled();
    expect(issueRefundCore).not.toHaveBeenCalled();
    // Not even the privileged client is reached — the guard returns first.
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("stays idempotent for an already-cancelled ticket", async () => {
    const result = await cancelUserTicketCore(
      callerClient("cancelled"),
      USER,
      TICKET,
      "tx-1",
    );

    expect(result.status).toBe(200);
    expect(issueRefundCore).not.toHaveBeenCalled();
    expect(releaseTicketQuantity).not.toHaveBeenCalled();
  });

  it("returns 404 when the ticket is not the caller's", async () => {
    const empty = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({ data: null, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient<Database>;

    const result = await cancelUserTicketCore(empty, USER, TICKET, null);

    expect(result.status).toBe(404);
    expect(issueRefundCore).not.toHaveBeenCalled();
  });
});
