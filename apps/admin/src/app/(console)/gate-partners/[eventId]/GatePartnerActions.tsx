"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import {
  endGatePartnerLink,
  linkGatePartnerEvent,
  markGatePartnerVoided,
  previewGatePartnerCatalog,
  recheckGatePartnerLink,
  retryGatePartnerPush,
  setGatePartnerLinkStatus,
} from "@/server/actions/gatePartners";
import type { GatePartnerEvent } from "@abonten/core/gatePartners/gateLinkRules";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { tryFromMajor } from "@abonten/core/money/money";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Staff actions on one gate-partner event. Every one needs
// gatepartners.manage and a fresh re-auth, takes a reason and is audited.

type Result = { status: number; message?: string; data?: unknown };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (work: () => Promise<Result>, onOk?: (r: Result) => void) =>
    start(async () => {
      setMsg(null);
      const res = await work();
      setMsg({
        ok: res.status === 200,
        text:
          res.message ?? (res.status === 200 ? "Done." : "Couldn't do that."),
      });
      if (res.status === 200) {
        onOk?.(res);
        router.refresh();
      }
    });
  const note = msg ? (
    <p
      role={msg.ok ? "status" : "alert"}
      className={cn(
        "text-sm",
        msg.ok ? "text-muted-foreground" : "text-destructive",
      )}
    >
      {msg.text}
    </p>
  ) : null;
  return { pending, run, note };
}

export function NeedsStepUp({
  eventId,
  canManage,
  stepUpFresh,
}: {
  eventId: string;
  canManage: boolean;
  stepUpFresh: boolean;
}) {
  if (!canManage) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        Changing a link needs the “Manage gate partner links” permission.
      </Card>
    );
  }
  if (!stepUpFresh) {
    return (
      <Card className="flex items-center gap-2 p-3 text-sm">
        Linking, pausing and retrying decide whose code admits a paying buyer:
        they need a fresh identity check.
        <StepUpButton next={`/gate-partners/${eventId}`} />
      </Card>
    );
  }
  return null;
}

function ReasonField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">Reason (kept in the audit log)</span>
      <input
        value={value}
        maxLength={500}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );
}

export function GatePartnerLinkForm({
  eventId,
  currency,
  ticketTypes,
}: {
  eventId: string;
  currency: string | null;
  ticketTypes: { id: string; type: string; price: number }[];
}) {
  const { pending, run, note } = useRun();
  const [apiKeyEnv, setApiKeyEnv] = useState("HAPNIIN_API_KEY");
  const [webhookSecretEnv, setWebhookSecretEnv] = useState(
    "HAPNIIN_WEBHOOK_SECRET",
  );
  const [events, setEvents] = useState<GatePartnerEvent[] | null>(null);
  const [keyMode, setKeyMode] = useState<string | null>(null);
  const [partnerEventId, setPartnerEventId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const partnerEvent = events?.find((e) => e.id === partnerEventId) ?? null;
  const say = (amount: number, code: string) => {
    const m = tryFromMajor(amount, code);
    return m ? formatMoney(m, { locale: "en" }) : `${amount} ${code}`;
  };

  return (
    <Card className="space-y-4 p-4">
      <p className="font-semibold">Link this event to a partner's event</p>
      <p className="text-xs text-muted-foreground">
        Only before the first sale. Every ticket type must map to one of the
        partner event's tickets at the same price; seated events, several dates,
        open amounts, group tickets and prices, passes and free tickets cannot
        be linked. The key and webhook secret are read from these server
        variables (their values are never stored).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">API key variable</span>
          <input
            value={apiKeyEnv}
            onChange={(e) => setApiKeyEnv(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Webhook secret variable</span>
          <input
            value={webhookSecretEnv}
            onChange={(e) => setWebhookSecretEnv(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
          />
        </label>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !apiKeyEnv}
        onClick={() =>
          run(
            () =>
              previewGatePartnerCatalog({
                eventId,
                provider: "hapniin",
                apiKeyEnv,
              }).catch(actionUnreachable),
            (res) => {
              const data = res.data as {
                events: GatePartnerEvent[];
                keyMode: string;
              };
              setEvents(data.events);
              setKeyMode(data.keyMode);
            },
          )
        }
      >
        Load the partner's events
      </Button>

      {events ? (
        <div className="space-y-3">
          <p className="text-sm">
            {events.length} live event(s) for this {keyMode} key.
          </p>
          <label className="block text-sm">
            <span className="font-medium">Partner event</span>
            <select
              value={partnerEventId}
              onChange={(e) => {
                setPartnerEventId(e.target.value);
                setMapping({});
              }}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {e.startDate?.slice(0, 16) ?? "no date"} ·{" "}
                  {e.venueName ?? ""} ({e.id})
                </option>
              ))}
            </select>
          </label>
          {partnerEvent ? (
            <div className="space-y-2">
              {ticketTypes.map((t) => (
                <label key={t.id} className="block text-sm">
                  <span className="font-medium">
                    {t.type} · {currency ? say(t.price, currency) : t.price}
                  </span>
                  <select
                    value={mapping[t.id] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [t.id]: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">Choose the partner's ticket…</option>
                    {partnerEvent.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.type} ·{" "}
                        {say(p.price, partnerEvent.currency)} ({p.id})
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <ReasonField value={reason} onChange={setReason} />
      <Button
        size="sm"
        disabled={
          pending ||
          !partnerEvent ||
          reason.trim().length < 5 ||
          ticketTypes.some((t) => !mapping[t.id])
        }
        onClick={() =>
          run(() =>
            linkGatePartnerEvent({
              eventId,
              provider: "hapniin",
              partnerEventId,
              apiKeyEnv,
              webhookSecretEnv: webhookSecretEnv.trim() || null,
              mapping: ticketTypes.map((t) => ({
                ticketTypeId: t.id,
                partnerProductId: mapping[t.id],
              })),
              reason: reason.trim(),
            }).catch(actionUnreachable),
          )
        }
      >
        Link
      </Button>
      {note}
    </Card>
  );
}

export function GatePartnerLinkControls({
  eventId,
  status,
}: {
  eventId: string;
  status: string;
}) {
  const { pending, run, note } = useRun();
  const confirm = useConfirm();
  const [reason, setReason] = useState("");
  const short = reason.trim().length < 5;
  return (
    <Card className="space-y-3 p-4">
      <ReasonField value={reason} onChange={setReason} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() =>
              recheckGatePartnerLink({ eventId }).catch(actionUnreachable),
            )
          }
        >
          Check prices again
        </Button>
        {status === "active" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || short}
            onClick={async () => {
              if (
                await confirm(
                  "Pause sales? Nobody can buy this event's tickets on Abonten until it is resumed. Sales already made are still registered.",
                  { confirmLabel: "Pause sales" },
                )
              ) {
                run(() =>
                  setGatePartnerLinkStatus({
                    eventId,
                    status: "paused",
                    reason: reason.trim(),
                  }).catch(actionUnreachable),
                );
              }
            }}
          >
            Pause sales
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || short}
            onClick={() =>
              run(() =>
                setGatePartnerLinkStatus({
                  eventId,
                  status: "active",
                  reason: reason.trim(),
                }).catch(actionUnreachable),
              )
            }
          >
            Resume sales
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          disabled={pending || short}
          onClick={async () => {
            if (
              await confirm(
                "End this link? Only possible before the first sale; tickets then carry Abonten codes again.",
                { confirmLabel: "End link", danger: true },
              )
            ) {
              run(() =>
                endGatePartnerLink({ eventId, reason: reason.trim() }).catch(
                  actionUnreachable,
                ),
              );
            }
          }}
        >
          End link
        </Button>
      </div>
      {note}
    </Card>
  );
}

export function RetryPushButton({
  eventId,
  pushId,
  refused,
}: {
  eventId: string;
  pushId: string;
  /** The partner refused it: the retry is a new request (new key). */
  refused: boolean;
}) {
  const { pending, run, note } = useRun();
  const confirm = useConfirm();
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          if (
            await confirm(
              refused
                ? "Send it again as a new request? Only after fixing what the partner refused (check its dashboard first)."
                : "Send it again now? It keeps its idempotency key, so the partner replays the first order if there was one.",
              { confirmLabel: "Retry" },
            )
          ) {
            run(() =>
              retryGatePartnerPush(eventId, {
                pushId,
                reason: refused
                  ? "Retry after the partner refused the sale"
                  : "Retry a stuck sale",
              }).catch(actionUnreachable),
            );
          }
        }}
      >
        Retry
      </Button>
      {note}
    </div>
  );
}

export function MarkVoidedButton({
  eventId,
  ticketIds,
}: {
  eventId: string;
  ticketIds: string[];
}) {
  const { pending, run, note } = useRun();
  const confirm = useConfirm();
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <ReasonField value={reason} onChange={setReason} />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || reason.trim().length < 5}
        onClick={async () => {
          if (
            await confirm(
              `Record ${ticketIds.length} code(s) as voided? Only once they are voided in the partner's system.`,
              { confirmLabel: "Record as voided" },
            )
          ) {
            run(() =>
              markGatePartnerVoided({
                eventId,
                ticketIds,
                reason: reason.trim(),
              }).catch(actionUnreachable),
            );
          }
        }}
      >
        Record all as voided
      </Button>
      {note}
    </div>
  );
}
