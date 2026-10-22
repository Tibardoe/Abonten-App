// A market's emergency numbers (market.safety_config.emergencyNumbers),
// read defensively: staff edit this in the admin console and a malformed
// entry must never hide the good ones.

import type {
  SafetyEmergencyNumber,
  SafetyEmergencyService,
} from "@abonten/types/safetyType";

const SERVICES: readonly SafetyEmergencyService[] = [
  "all",
  "police",
  "ambulance",
  "fire",
];

const NUMBER = /^[0-9+*#]{2,15}$/;

export function parseEmergencyNumbers(
  config: unknown,
): SafetyEmergencyNumber[] {
  if (!config || typeof config !== "object") return [];
  const list = (config as { emergencyNumbers?: unknown }).emergencyNumbers;
  if (!Array.isArray(list)) return [];
  const out: SafetyEmergencyNumber[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const { service, number } = entry as {
      service?: unknown;
      number?: unknown;
    };
    if (typeof service !== "string" || typeof number !== "string") continue;
    if (!(SERVICES as readonly string[]).includes(service)) continue;
    const clean = number.replace(/\s/g, "");
    if (!NUMBER.test(clean)) continue;
    const key = `${service}:${clean}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ service: service as SafetyEmergencyService, number: clean });
  }
  // The all-emergencies number first: it is the one every screen leads with.
  return out.sort(
    (a, b) => SERVICES.indexOf(a.service) - SERVICES.indexOf(b.service),
  );
}

/** The number a single "Call emergency services" button dials. */
export function primaryEmergencyNumber(
  numbers: readonly SafetyEmergencyNumber[],
): SafetyEmergencyNumber | null {
  return numbers.find((n) => n.service === "all") ?? numbers[0] ?? null;
}

export function serializeEmergencyNumbers(
  numbers: readonly SafetyEmergencyNumber[],
): { emergencyNumbers: SafetyEmergencyNumber[] } {
  return {
    emergencyNumbers: parseEmergencyNumbers({ emergencyNumbers: numbers }),
  };
}
