import { describe, expect, it } from "vitest";
import {
  PRODUCTION_SUPABASE_REF,
  productionDatabaseOffProductionProblem,
} from "./productionProject";

const prod = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;

describe("a non-production deployment never uses the production database", () => {
  it("refuses a preview or development deployment on the production project", () => {
    expect(
      productionDatabaseOffProductionProblem({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: prod,
      }),
    ).toMatch(/preview deployment must not use the production database/);
    expect(
      productionDatabaseOffProductionProblem({
        VERCEL_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: prod,
      }),
    ).toMatch(/development deployment/);
  });

  it("allows production, a preview on another project, and local work", () => {
    expect(
      productionDatabaseOffProductionProblem({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: prod,
      }),
    ).toBeNull();
    expect(
      productionDatabaseOffProductionProblem({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: "https://qasxtirvfbreygsqwwat.supabase.co",
      }),
    ).toBeNull();
    expect(
      productionDatabaseOffProductionProblem({
        NEXT_PUBLIC_SUPABASE_URL: prod,
      }),
    ).toBeNull();
    expect(
      productionDatabaseOffProductionProblem({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:53321",
      }),
    ).toBeNull();
    expect(
      productionDatabaseOffProductionProblem({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: "not a url",
      }),
    ).toBeNull();
  });
});
