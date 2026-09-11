import QRCode from "qrcode";
import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";

// A QR code drawn with react-native-svg (no native module). Always dark on
// white with a 4-module quiet zone, whatever the app theme, so any scanner
// can read it.
export function QrCode({
  value,
  size = 180,
  accessibilityLabel,
}: {
  value: string;
  size?: number;
  accessibilityLabel?: string;
}) {
  const { path, extent } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.data[y * n + x]) d += `M${x + 4},${y + 4}h1v1h-1z`;
      }
    }
    return { path: d, extent: n + 8 };
  }, [value]);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      accessibilityLabel={accessibilityLabel}
    >
      <Rect width={extent} height={extent} fill="#ffffff" />
      <Path d={path} fill="#111111" />
    </Svg>
  );
}
