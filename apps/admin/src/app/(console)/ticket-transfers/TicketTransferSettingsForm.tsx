"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { updateTicketTransferSettings } from "@/server/actions/ticketTransfers";
import type {
  TicketTransferAdminSettings,
  TicketTransferAudience,
} from "@abonten/types/ticketTransferType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

export function TicketTransferSettingsForm({
  settings,
  killSwitch,
  canConfigure,
  stepUpFresh,
}: {
  settings: TicketTransferAdminSettings;
  killSwitch: boolean;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [audience, setAudience] = useState<TicketTransferAudience>(
    settings.audience,
  );
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [maxMoves, setMaxMoves] = useState(String(settings.maxMoves));
  const [acceptHours, setAcceptHours] = useState(String(settings.acceptHours));
  const [texts, setTexts] = useState(String(settings.textsPerSenderPerDay));
  const [reason, setReason] = useState("");
  const editable = canConfigure && stepUpFresh;

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        enabled &&
        audience === "all" &&
        (!settings.enabled || settings.audience !== "all") &&
        !(await confirm(
          "Open sending tickets to everyone? Before this, counsel should have approved the Terms for sending tickets (refunds go to whoever paid) and the help page should be listed.",
          { confirmLabel: "Open to everyone" },
        ))
      ) {
        return;
      }
      const res = await updateTicketTransferSettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          enabled,
          audience,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          maxMoves: Number(maxMoves),
          acceptHours: Number(acceptHours),
          textsPerSenderPerDay: Number(texts),
        },
      }).catch(actionUnreachable);
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  return (
    <div className="max-w-3xl space-y-4">
      {killSwitch ? (
        <Card className="border-destructive/40 p-3 text-sm">
          TICKET_TRANSFERS_KILL_SWITCH is set on the web deployment. Nobody can
          send a ticket or accept one until it is removed, whatever these
          settings say. Open offers can still be declined or taken back, and the
          job still ends the ones that run out.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/ticket-transfers" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure ticket
          transfers” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Who can send tickets</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            disabled={!editable}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block">Sending tickets switched on</span>
            <span className="block text-xs text-muted-foreground">
              Off stops new offers. Open offers can still be accepted, declined
              or taken back, so no ticket is left between two people.
            </span>
          </span>
        </label>
        <div className="text-sm">
          <label htmlFor="transfers-audience" className="block font-medium">
            Audience
          </label>
          <select
            id="transfers-audience"
            value={audience}
            disabled={!editable}
            onChange={(e) =>
              setAudience(e.target.value as TicketTransferAudience)
            }
            className={cn(input, "mt-1 w-64")}
          >
            <option value="staff">Staff only (active admins)</option>
            <option value="beta">Staff + beta users</option>
            <option value="all">Everyone</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Who may send. Anyone can accept a ticket sent to them.
          </span>
        </div>
        {audience === "beta" ? (
          <label className="block text-sm">
            <span className="font-medium">Beta user ids</span>
            <span className="block text-xs text-muted-foreground">
              One user id per line (copy it from the user&apos;s admin page).
            </span>
            <textarea
              value={beta}
              disabled={!editable}
              rows={4}
              onChange={(e) => setBeta(e.target.value)}
              className={cn(input, "mt-1 font-mono text-xs")}
            />
          </label>
        ) : null}
      </Card>

      <Card className="grid gap-4 p-4 md:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Moves per ticket, at most</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxMoves}
            disabled={!editable}
            onChange={(e) => setMaxMoves(e.target.value)}
            className={cn(input, "mt-1")}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Decision X2: 3. A ticket passed on many times is a sign of touting.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Hours to accept</span>
          <input
            type="number"
            min={1}
            max={336}
            value={acceptHours}
            disabled={!editable}
            onChange={(e) => setAcceptHours(e.target.value)}
            className={cn(input, "mt-1")}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Decision X3: 48. Then the ticket stays with the sender.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Texts per sender per day</span>
          <input
            type="number"
            min={0}
            max={200}
            value={texts}
            disabled={!editable}
            onChange={(e) => setTexts(e.target.value)}
            className={cn(input, "mt-1")}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Decision X44: Abonten pays the text to a number with no account. 0
            stops texts; offers to accounts still work.
          </span>
        </label>
      </Card>

      {editable ? (
        <Card className="space-y-2 p-4">
          <label className="block text-sm">
            <span className="font-medium">Reason for this change</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={cn(input, "mt-1")}
            />
          </label>
          <div className="flex items-center gap-3">
            <Button
              onClick={save}
              disabled={pending || reason.trim().length < 5}
            >
              {pending ? "Saving…" : "Save settings"}
            </Button>
            {msg ? (
              <span
                className={cn(
                  "text-sm",
                  msg.ok ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {msg.text}
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
