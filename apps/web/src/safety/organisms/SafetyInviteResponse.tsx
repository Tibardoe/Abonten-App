"use client";

import { getSafetyInvite } from "@/actions/safety/getSafetyInvite";
import { respondSafetyInvite } from "@/actions/safety/respondSafetyInvite";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import type {
  SafetyInviteResponse as Response,
  SafetyInviteView,
} from "@abonten/types/safetyType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

// A new trusted contact's answer to "Ama added you as an emergency
// contact". Accepting needs no account; accepting while signed in brings
// alerts to the Abonten app too. "Stop all" blocks every Abonten Safety
// text to the number, from anyone, until they accept someone again.

type Envelope = { status: number; message?: string; data?: SafetyInviteView };

export default function SafetyInviteResponse({ token }: { token: string }) {
  const t = useTranslations("safety");
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const key = ["safety-invite", token];
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Envelope> =>
      answerOrThrow(await getSafetyInvite({ token })),
  });
  const respond = useMutation({
    mutationFn: (response: Response) =>
      respondSafetyInvite({ token, response }),
    onSuccess: (res) => {
      if (res.status === 200 && res.data) {
        qc.setQueryData(key, res);
        toast.success(t("inviteAnswered"));
      } else toast.error(res.message ?? t("couldNotSave"));
    },
    onError: () => toast.error(t("networkError")),
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const view = query.data?.data;
  if (!view) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <PageTitle>{t("invitePageTitle")}</PageTitle>
        <SupportingText>
          {query.isError
            ? t("networkError")
            : (query.data?.message ?? t("linkEnded"))}
        </SupportingText>
      </div>
    );
  }

  const blockAll = async () => {
    const ok = await confirm({
      title: t("blockAllTitle"),
      message: t("blockAllBody"),
      confirmLabel: t("blockAll"),
      cancelLabel: t("cancel"),
    });
    if (ok) respond.mutate("block_all");
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div>
        <PageTitle>{t("inviteHeading", { person: view.personName })}</PageTitle>
        <SupportingText>
          {t("inviteBody", { person: view.personName, name: view.contactName })}
        </SupportingText>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("inviteWhat1", { person: view.personName })}</li>
        <li>{t("inviteWhat2", { person: view.personName })}</li>
        <li>{t("inviteWhat3")}</li>
      </ul>
      {view.status === "accepted" ? (
        <p className="rounded-xl border bg-emerald-500/10 p-4 text-sm">
          {t("inviteAccepted", { person: view.personName })}
        </p>
      ) : view.status === "declined" ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          {view.blockedEveryone
            ? t("inviteBlockedAll")
            : t("inviteDeclined", { person: view.personName })}
        </p>
      ) : null}
      {view.blockedEveryone && view.status !== "accepted" ? (
        <p className="text-xs text-muted-foreground">{t("acceptLiftsBlock")}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {view.status !== "accepted" ? (
          <Button
            disabled={respond.isPending}
            onClick={() => respond.mutate("accept")}
          >
            {t("acceptInvite")}
          </Button>
        ) : null}
        {view.status !== "declined" ? (
          <Button
            variant="outline"
            disabled={respond.isPending}
            onClick={() => respond.mutate("decline")}
          >
            {view.status === "accepted"
              ? t("stopBeingContact")
              : t("declineInvite")}
          </Button>
        ) : null}
        {!view.blockedEveryone ? (
          <Button
            variant="ghost"
            disabled={respond.isPending}
            onClick={() => void blockAll()}
          >
            {t("blockAll")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("notEmergencyServices")}
      </p>
    </div>
  );
}
