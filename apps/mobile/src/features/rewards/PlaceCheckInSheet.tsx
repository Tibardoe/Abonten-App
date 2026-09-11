import { AppText, Button, Icon, Sheet } from "@abonten/ui-native";
import {
  type BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { parseVisitQr } from "./usePlaceVisits";

// Scan a place's check-in QR code in the app (Rewards Phase 8). Hands the
// place and the code back; the caller does the check-in (location + API).
export function PlaceCheckInSheet({
  open,
  onClose,
  onScanned,
}: {
  open: boolean;
  onClose: () => void;
  onScanned: (visit: { slug: string; code: string }) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const lockedRef = useRef(false);

  useEffect(() => {
    if (open && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
    if (!open) {
      lockedRef.current = false;
      setError(null);
    }
  }, [open, permission, requestPermission]);

  const handle = useCallback(
    (result: BarcodeScanningResult) => {
      if (lockedRef.current) return;
      const visit = parseVisitQr(result.data);
      if (!visit) {
        setError("That isn't a place check-in code.");
        return;
      }
      lockedRef.current = true;
      onScanned(visit);
    },
    [onScanned],
  );

  const denied = permission?.granted === false && !permission.canAskAgain;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Check in"
      footer={<Button title="Cancel" variant="outline" onPress={onClose} />}
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
              Turn on camera access for Abonten in Settings to scan the code.
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
              Allow camera access to scan the place's check-in code.
            </AppText>
            <Button
              title="Allow camera"
              size="sm"
              onPress={() => requestPermission()}
            />
          </View>
        ) : open ? (
          <>
            <View
              className="overflow-hidden rounded-2xl bg-black"
              style={{ aspectRatio: 1 }}
            >
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={handle}
              />
            </View>
            <AppText variant="caption" className="text-center">
              Point the camera at the code the place shows at its counter or
              entrance.
            </AppText>
          </>
        ) : null}
        {error ? (
          <AppText variant="small" tone="error" className="text-center">
            {error}
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}
