// Paystack's API takes amounts as integers in the currency's smallest unit
// (pesewas for GHS, kobo for NGN, etc.) — this app stores/computes money as
// GHS numeric(10,2) everywhere else. Conversion happens only at this one
// boundary so floating-point money math never spreads into the rest of the
// codebase.

export function toPesewas(ghsAmount: number): number {
  return Math.round(ghsAmount * 100);
}

export function fromPesewas(pesewas: number): number {
  return pesewas / 100;
}
