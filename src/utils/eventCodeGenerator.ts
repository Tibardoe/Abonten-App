export function generateEventCode(title: string) {
  const words = title.trim().split(" ");
  const prefix = words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join(""); // e.g., "Tech Conference" -> "TC"
  const random = Math.floor(1000 + Math.random() * 9000); // random 4-digit number
  return `${prefix}${random}`; // TC4921
}
