import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadGatePartnerEvent } from "@/lib/data";
import { OPS_TIME_ZONE_LABEL, formatOpsDateTime } from "@/lib/format";
import {
  GATE_PUSH_STATUS_TEXT,
  GATE_TICKET_STATE_TEXT,
} from "@abonten/core/admin/gatePartnerText";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import {
  GATE_PARTNERS_FLAG,
  gatePartnerName,
} from "@abonten/core/gatePartners/gateLinkRules";
import Link from "next/link";
import {
  GatePartnerLinkControls,
  GatePartnerLinkForm,
  MarkVoidedButton,
  NeedsStepUp,
  RetryPushButton,
} from "./GatePartnerActions";

// One event and its gate partner: the link (or the form to make it), every
// sale registered with the partner and the codes to void. English-only.

const REFUSED_CODES = new Set([
  "VALIDATION_ERROR",
  "EVENT_NOT_FOUND",
  "SEATED_EVENT_NOT_SUPPORTED",
  "NO_ITEMS",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_NOT_ON_SALE",
  "PRODUCT_SALE_ENDED",
  "INVALID_QUANTITY",
  "SOLD_OUT",
  "BUYER_DETAILS",
  "NOT_MAPPED",
]);

export default async function GatePartnerEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requirePermissionPage("gatepartners.view");
  const { eventId } = await params;
  const { ctx, detail } = await loadGatePartnerEvent(eventId);
  const data = detail.data;
  if (detail.status !== 200 || !data) {
    return (
      <div>
        <PageHeader title="Gate partner" />
        <EmptyState>{detail.message ?? "Couldn't load the event."}</EmptyState>
      </div>
    );
  }
  const canManage = ctx.permissions.includes("gatepartners.manage");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const ready = canManage && stepUpFresh;
  const link = data.link && data.link.status !== "ended" ? data.link : null;
  const typeName = (id: string) =>
    data.event.ticketTypes.find((t) => t.id === id)?.type ?? id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.event.title || "Event"}
        description={
          <>
            <Link className="underline" href="/gate-partners">
              Gate partners
            </Link>{" "}
            · starts {formatOpsDateTime(data.event.startsAt)}{" "}
            {OPS_TIME_ZONE_LABEL} · status {data.event.status}
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={data.flagOn ? "success" : "warning"}>
          {GATE_PARTNERS_FLAG} {data.flagOn ? "on" : "off"} for the organizer
        </Badge>
        {data.killSwitch ? (
          <Badge tone="danger">GATE_PARTNERS_KILL_SWITCH on</Badge>
        ) : null}
        {link ? (
          <Badge tone={link.status === "active" ? "success" : "warning"}>
            {link.status === "active" ? "Selling" : "Sales paused"}
          </Badge>
        ) : (
          <Badge>Not linked</Badge>
        )}
      </div>

      <NeedsStepUp
        eventId={eventId}
        canManage={canManage}
        stepUpFresh={stepUpFresh}
      />

      {link ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-1 p-4 text-sm">
            <p className="font-semibold">Link</p>
            <p>
              {gatePartnerName(link.provider)} event{" "}
              <span className="font-mono">{link.partnerEventId}</span>
              {link.partnerEventTitle ? ` · ${link.partnerEventTitle}` : ""}
            </p>
            <p>
              Key <span className="font-mono">{link.apiKeyEnv}</span> (
              {link.keyMode})
              {link.keyUsable ? (
                <span className="block text-destructive">{link.keyUsable}</span>
              ) : null}
            </p>
            <p>
              Webhook secret{" "}
              <span className="font-mono">
                {link.webhookSecretEnv ?? "none (codes are fetched anyway)"}
              </span>
            </p>
            <p className="text-muted-foreground">
              Checked {timeAgo(link.checkedAt)}
            </p>
            {link.checkProblems.length > 0 ? (
              <ul className="list-disc pl-5 text-destructive">
                {link.checkProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </Card>
          <Card className="space-y-1 p-4 text-sm">
            <p className="font-semibold">Ticket types</p>
            {link.products.map((p) => (
              <p key={p.ticketTypeId} className="flex justify-between gap-3">
                <span>{typeName(p.ticketTypeId)}</span>
                <span className="text-muted-foreground">
                  {p.partnerProductName ?? p.partnerProductId} ·{" "}
                  {p.partnerPrice} {data.event.currency}
                </span>
              </p>
            ))}
          </Card>
        </div>
      ) : (
        <Card className="space-y-2 p-4 text-sm">
          <p className="font-semibold">Can this event be linked?</p>
          {data.problems.length === 0 ? (
            <p className="text-muted-foreground">
              Yes, as far as the event goes. The partner's catalog is checked
              when you link.
            </p>
          ) : (
            <ul className="list-disc pl-5 text-destructive">
              {data.problems.map((p) => (
                <li key={p.code}>{p.text}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {ready && link ? (
        <GatePartnerLinkControls eventId={eventId} status={link.status} />
      ) : null}
      {ready && !link && data.problems.length === 0 ? (
        <GatePartnerLinkForm
          eventId={eventId}
          currency={data.event.currency}
          ticketTypes={data.event.ticketTypes}
        />
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Codes to void</h2>
        <p className="text-sm text-muted-foreground">
          Tickets cancelled or refunded on Abonten. The organizer is told (app
          and email) to void them in the partner's system; record them here once
          done. {data.voided} already recorded as voided.
        </p>
        {data.toVoid.length === 0 ? (
          <EmptyState>Nothing to void.</EmptyState>
        ) : (
          <Card className="space-y-3 p-4">
            <ul className="flex flex-wrap gap-2">
              {data.toVoid.map((v) => (
                <li
                  key={v.ticketId}
                  className="rounded border border-border px-2 py-1 font-mono text-xs"
                  title={`${GATE_TICKET_STATE_TEXT.to_void} since ${formatOpsDateTime(v.requestedAt)} ${OPS_TIME_ZONE_LABEL}${v.notified ? "; organizer told" : "; organizer not told yet"}`}
                >
                  {v.code}
                </li>
              ))}
            </ul>
            {ready ? (
              <MarkVoidedButton
                eventId={eventId}
                ticketIds={data.toVoid.map((v) => v.ticketId)}
              />
            ) : null}
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sales registered</h2>
        {data.pushes.length === 0 ? (
          <EmptyState>No sale yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sale</Th>
                <Th>Ticket type</Th>
                <Th>Tickets</Th>
                <Th>State</Th>
                <Th>Partner order</Th>
                <Th>Tries</Th>
                <Th>Last error</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.pushes.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">
                    {p.id.slice(0, 8)}
                    <span className="block text-muted-foreground">
                      {timeAgo(p.createdAt)}
                    </span>
                  </Td>
                  <Td>{p.ticketType}</Td>
                  <Td>{p.quantity ?? "–"}</Td>
                  <Td>
                    <Badge
                      tone={
                        p.status === "done"
                          ? "success"
                          : p.status === "failed"
                            ? "danger"
                            : p.status === "cancelled"
                              ? "neutral"
                              : "warning"
                      }
                    >
                      {GATE_PUSH_STATUS_TEXT[p.status] ?? p.status}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-xs">
                    {p.partnerOrderId ?? "–"}
                    {p.partnerConfirmedAt ? (
                      <span className="block text-muted-foreground">
                        confirmed by webhook
                      </span>
                    ) : null}
                    <span
                      className="block text-muted-foreground"
                      title="Idempotency-Key"
                    >
                      {p.idempotencyKey}
                    </span>
                  </Td>
                  <Td>
                    {p.attempts}
                    {["queued", "ordered"].includes(p.status) ? (
                      <span className="block text-xs text-muted-foreground">
                        next {formatOpsDateTime(p.nextAttemptAt)}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="max-w-xs text-xs">
                    {p.lastErrorCode ? (
                      <span className="font-mono">
                        {p.lastErrorCode}
                        {p.lastHttpStatus ? ` (${p.lastHttpStatus})` : ""}
                      </span>
                    ) : null}{" "}
                    {p.lastErrorDetail ?? ""}
                  </Td>
                  <Td>
                    {ready &&
                    ["failed", "queued", "ordered"].includes(p.status) ? (
                      <RetryPushButton
                        eventId={eventId}
                        pushId={p.id}
                        refused={
                          p.status === "failed" &&
                          !p.partnerOrderId &&
                          REFUSED_CODES.has(p.lastErrorCode ?? "")
                        }
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
