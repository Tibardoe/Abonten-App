import { useCheckInTicket } from "@/features/organizer/useAttendees";
import { AppText, Button, Icon, Sheet } from "@abonten/ui-native";
import {
  type BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";

// Organizer ticket QR scanner — the missing counterpart to the manual
// attendee-list toggle. The ticket QR encodes `JSON.stringify(
// "<base>/verify/TKT-XXXXXXXX")`; we pull the `TKT-…` code out of whatever
// shape comes back and hand it to the same checkInTicket path the list
// uses (checkInTicketCore resolves a code OR a uuid, and still 403s unless
// the caller owns the event). One successful scan → a short cooldown so a
// QR held in frame doesn't fire repeatedly.

const SCAN_COOLDOWN_MS = 2500;

/** Pull a `TKT-XXXXXXXX` code out of a scanned QR payload. */
export function parseTicketCode(raw: string): string | null {
  let value = raw.trim();
  // The QR content is a JSON-stringified URL — unwrap the quotes if present.
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.slice(1, -1);
    }
  }
  const match = value.match(/TKT-[A-Z0-9]+/i);
  return match ? match[0].toUpperCase() : null;
}

type Outcome = { ok: boolean; message: string } | null;

export function TicketScannerSheet({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const checkIn = useCheckInTicket(eventId);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const lockedRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [open, permission, requestPermission]);

  useEffect(() => {
    if (!open) {
      lockedRef.current = false;
      setOutcome(null);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    }
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, [open]);

  const onScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (lockedRef.current || checkIn.isPending) return;
      const code = parseTicketCode(result.data);
      if (!code) {
        setOutcome({ ok: false, message: "That isn't an Abonten ticket QR." });
        return;
      }
      lockedRef.current = true;
      checkIn.mutate(
        { ticketId: code, checkedIn: true },
        {
          onSuccess: (res) => {
            const ok = res.status === 200;
            setOutcome({
              ok,
              message: ok
                ? `${code} — checked in.`
                : (res.message ?? "Couldn't check that ticket in."),
            });
            if (ok) setScannedCount((n) => n + 1);
          },
          onError: (e) =>
            setOutcome({
              ok: false,
              message: e instanceof Error ? e.message : "Something went wrong.",
            }),
          onSettled: () => {
            cooldownRef.current = setTimeout(() => {
              lockedRef.current = false;
            }, SCAN_COOLDOWN_MS);
          },
        },
      );
    },
    [checkIn],
  );

  const denied = permission?.granted === false && !permission.canAskAgain;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Scan tickets"
      footer={
        <Button
          title={
            scannedCount > 0 ? `Done — ${scannedCount} checked in` : "Done"
          }
          onPress={onClose}
        />
      }
    >
      <View className="gap-4">
        {!permission ? (
          <AppText variant="muted">Preparing the camera…</AppText>
        ) : denied ? (
          <View className="items-center gap-3 py-4">
            <Icon name="camera-outline" size={40} tone="muted" />
            <AppText variant="bodyStrong" className="text-center">
              Camera access is off
            </AppText>
            <AppText variant="muted" className="text-center">
              Turn on camera access for Abonten in Settings to scan tickets.
            </AppText>
            <Button
              title="Open settings"
              variant="outline"
              size="sm"
              onPress={() =>
                Platform.OS === "ios"
                  ? Linking.openURL("app-settings:")
                  : Linking.openSettings()
              }
            />
          </View>
        ) : !permission.granted ? (
          <View className="items-center gap-3 py-4">
            <AppText variant="muted" className="text-center">
              Allow camera access to scan ticket QR codes.
            </AppText>
            <Button
              title="Allow camera"
              size="sm"
              onPress={() => requestPermission()}
            />
          </View>
        ) : (
          <>
            <View
              className="overflow-hidden rounded-2xl bg-black"
              style={{ aspectRatio: 1 }}
            >
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={onScanned}
              />
            </View>
            <AppText variant="caption" className="text-center">
              Point the camera at the QR on the attendee's ticket.
            </AppText>
          </>
        )}

        {outcome ? (
          <View
            className={`flex-row items-center gap-2 rounded-xl border px-3 py-2.5 ${
              outcome.ok
                ? "border-mint bg-mint/10"
                : "border-destructive/40 bg-destructive/10"
            }`}
          >
            <Icon
              name={outcome.ok ? "checkmark-circle" : "alert-circle"}
              size={18}
              tone={outcome.ok ? "success" : "destructive"}
            />
            <AppText
              variant="small"
              tone={outcome.ok ? "success" : "error"}
              className="flex-1 font-medium"
            >
              {checkIn.isPending ? "Checking in…" : outcome.message}
            </AppText>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
