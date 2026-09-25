import { GET as currentGet } from "@/app/api/mobile/payments/momo-networks/route";

// GET /api/mobile/paystack/momo-networks — the path app builds released
// before 2026-09-24 call for the "add mobile money" network picker. Same
// answer as /api/mobile/payments/momo-networks (the person's home market's
// networks, Ghana's by default). Remove once those builds are retired.
export const GET = currentGet;
