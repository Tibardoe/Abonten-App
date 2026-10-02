"use client";
import { useTranslations } from "next-intl";

export default function InlineErrorRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center border border-destructive/30 bg-destructive/5 rounded-md">
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline"
      >
        {t("tryAgain")}
      </button>
    </div>
  );
}
