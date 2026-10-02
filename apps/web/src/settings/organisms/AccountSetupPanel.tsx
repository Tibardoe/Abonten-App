"use client";

import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import {
  type ProfileCompletionGroup,
  type ProfileCompletionItem,
  profileCompletionGroupTitle,
  profileCompletionItemCopy,
} from "@abonten/core/profileCompletion";
import {
  AtSign,
  Camera,
  Check,
  ChevronRight,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

// Settings › Account setup: the five steps, what each is for, which are
// done, and a link straight to where each is finished (Edit Profile for the
// profile steps, Security for the email and phone codes). Nothing here is
// required to use Abonten and the copy never says otherwise.

const ICONS: Record<ProfileCompletionItem["key"], typeof User> = {
  name: User,
  username: AtSign,
  avatar: Camera,
  email: Mail,
  phone: Phone,
};

const GROUPS: ProfileCompletionGroup[] = ["profile", "account"];
const SKELETON_KEYS = ["a", "b", "c", "d", "e"];

function Row({ item }: { item: ProfileCompletionItem }) {
  const t = useTranslations("settings");
  const tc = useTranslations("core");

  const copy = profileCompletionItemCopy(tc, item);
  const Icon = item.complete ? Check : ICONS[item.key];
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            item.complete
              ? "bg-success/15 text-success"
              : "bg-accent text-primary"
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-card-foreground">
            {item.complete ? copy.doneLabel : copy.label}
          </span>
          {!item.complete ? (
            <span className="block text-sm text-muted-foreground">
              {copy.description}
            </span>
          ) : null}
          {item.state === "unverified" ? (
            <span className="block text-xs text-warning">
              {t("waitingForACode")}
            </span>
          ) : null}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export default function AccountSetupPanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("core");

  const {
    data: completion,
    isLoading,
    isError,
    refetch,
  } = useProfileCompletion();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        {SKELETON_KEYS.map((k) => (
          <Skeleton key={k} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError || !completion) {
    return (
      <InlineErrorRetry
        message={t("weCouldnTLoadYourAccount")}
        onRetry={() => refetch()}
      />
    );
  }

  const left = completion.total - completion.completedCount;

  return (
    <div className="space-y-8">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {completion.isComplete ? (
          <div>
            <p className="font-semibold">{t("youReAllSet")}</p>
            <p className="text-sm text-muted-foreground">
              {t("yourProfileIsCompleteAndYou")}
            </p>
          </div>
        ) : (
          <div>
            <p className="font-semibold">{t("stepsLeft", { left: left })}</p>
            <p className="text-sm text-muted-foreground">
              {t("noneOfTheseAreRequiredTo")}
            </p>
          </div>
        )}
        <Progress
          value={(completion.completedCount / completion.total) * 100}
          aria-label={t("ofStepsDone", {
            completedCount: completion.completedCount,
            total: completion.total,
          })}
        />
        <p className="text-xs text-muted-foreground">
          {t("ofStepsDone", {
            completedCount: completion.completedCount,
            total: completion.total,
          })}
        </p>
      </div>

      {GROUPS.map((group) => {
        const items = completion.items.filter((i) => i.group === group);
        const done = items.filter((i) => i.complete).length;
        return (
          <section key={group} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {profileCompletionGroupTitle(tc, group)}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("ofDone", { done: done, length: items.length })}
              </span>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <Row key={item.key} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
