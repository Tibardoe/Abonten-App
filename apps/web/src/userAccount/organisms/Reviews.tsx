import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function Reviews() {
  const t = useTranslations("account");

  return (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">{t("noReviewsYet")}</h1>

      <p>{t("leaveAReviewAndRating")}</p>

      <Button className="w-32 font-bold md:text-lg py-3 px-5">
        {t("addReview")}
      </Button>
    </div>
  );
}
