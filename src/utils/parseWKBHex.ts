export function parseWKBHex(hex: string) {
  const bytes = hex.match(/.{1,2}/g);
  if (!bytes) {
    throw new Error("Invalid WKB hex string");
  }

  const buffer = new DataView(
    new Uint8Array(bytes.map((byte) => Number.parseInt(byte, 16))).buffer,
  );

  const littleEndian = buffer.getUint8(0) === 1;
  const x = buffer.getFloat64(9, littleEndian); // Longitude
  const y = buffer.getFloat64(17, littleEndian); // Latitude

  return { eventLat: y, eventLng: x };
}
