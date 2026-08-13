import { deleteEvent } from "@/actions/deleteEvent";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Notification from "../atoms/Notification";

type DeletePopupProp = {
  handleShowDeletePopup: (state: boolean) => void;
  message: string;
  eventId: string;
};

export default function DeletePopupModal({
  handleShowDeletePopup,
  message,
  eventId,
}: DeletePopupProp) {
  const t = useTranslations("common");

  const [success, setSuccess] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const router = useRouter();

  useBodyScrollLock(true);

  const handleDeleteEvent = async () => {
    if (!eventId) return;

    try {
      setLoading(true);

      const response = await deleteEvent(eventId);

      if (response.status === 200) {
        setSuccess(response.message);
        setTimeout(() => {
          router.refresh(); // This will reload the page
        }, 1000); // Optional delay before refreshing
      } else {
        setError(response.message || t("errors.generic"));
      }
    } catch (error) {
      setError(t("errors.genericRetry"));
      console.log(error);
    } finally {
      setLoading(false);
      setTimeout(() => setError(null), 3000); // Clear error after 5 seconds
    }
  };
  return (
    <>
      <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-30">
        <div className="w-[70%] md:w-[30%] p-3 bg-card text-card-foreground rounded-xl shadow-lg">
          <h1 className="text-md font-bold text-center pb-3">{t("warning")}</h1>

          <hr className="border-border" />

          <div className="space-y-2 md:space-y-4">
            <p className="text-destructive text-center py-3 text-sm">
              {message}
            </p>

            <div className="flex gap-2 justify-center text-xs md:text-sm">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1 hover:bg-accent transition-colors"
                onClick={handleDeleteEvent}
                disabled={loading}
              >
                {loading ? t("status.deleting") : t("buttons.yes")}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary text-primary-foreground px-3 py-1 hover:bg-primary/90 transition-colors"
                onClick={() => handleShowDeletePopup(false)}
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {success && <Notification notification={success} />}
      {error && <Notification notification={error} />}
    </>
  );
}
