import { translatorFor } from "@/i18n/clientTranslator";

// Server Actions answer with an envelope instead of throwing. These narrow
// one to its data, or to a message a toast can show.

type AnyResult = { status: number; message?: string; data?: unknown };

type DataOf<R> = R extends { data?: infer D } ? NonNullable<D> : never;

export function dataOf<R extends AnyResult>(
  res: R | null | undefined,
): DataOf<R> | null {
  if (!res || res.status !== 200 || !("data" in res) || res.data == null) {
    return null;
  }
  return res.data as DataOf<R>;
}

export function messageOf(
  res: AnyResult | null | undefined,
  fallback?: string,
): string {
  return (
    res?.message ??
    fallback ??
    translatorFor("common")("somethingWentWrongPleaseTryAgain2")
  );
}
