"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { searchSimilarPlacesCore } from "@abonten/services/fieldOps/member/onboardingCore";
import type { FieldOpsSimilarPlace } from "@abonten/types/fieldOps";
import { fieldOpsSimilarSearchSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Existing listings that look like the business being onboarded. Same
 * service as POST /api/mobile/field-ops/onboardings/[id]/similar.
 */
export async function searchFieldOpsSimilarPlaces(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsSimilarPlace[];
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsSimilarSearchSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return searchSimilarPlacesCore(svc, userId, data);
}
