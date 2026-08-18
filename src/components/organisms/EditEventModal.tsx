"use client";

import Notification from "@/components/atoms/Notification";
import EditEventFormFields from "@/components/molecules/EditEventFormFields";
import UploadStepHeader from "@/components/molecules/UploadStepHeader";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useEventEditForm } from "@/hooks/useEventEditForm";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

type EditEventModalProps = {
  eventId: string;
  handleClosePopup: (state: boolean) => void;
};

export default function EditEventModal({
  eventId,
  handleClosePopup,
}: EditEventModalProps) {
  useBodyScrollLock(true);

  const router = useRouter();
  const queryClient = useQueryClient();

  const eventEditForm = useEventEditForm({
    eventId,
    onSuccess: () => {
      router.refresh();
      invalidateEventListQueries(queryClient);
      handleClosePopup(false);
    },
  });

  const {
    notification,
    isSubmitting,
    isFetchingEvent,
    isReady,
    handleSubmit,
    onSubmit,
  } = eventEditForm;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-background md:bg-overlay/50 md:flex md:items-center md:justify-center">
        <div className="flex flex-col h-full w-full md:h-[95%] md:w-[60%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground py-3 overflow-y-auto">
          <UploadStepHeader
            onBack={() => handleClosePopup(false)}
            title="Edit event"
            primaryAction={{
              label: isSubmitting ? "Saving..." : "Save",
              onClick: handleSubmit(onSubmit),
              disabled: isSubmitting || !isReady,
            }}
          />

          {isFetchingEvent ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Loading event...
            </div>
          ) : (
            <EditEventFormFields
              {...eventEditForm}
              className="space-y-4 w-full md:w-[80%] mx-auto"
            />
          )}
        </div>
      </div>

      <Notification notification={notification} />
    </>
  );
}
