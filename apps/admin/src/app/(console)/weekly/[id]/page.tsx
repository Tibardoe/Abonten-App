import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadWeeklyEdition } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { formatWeekRange } from "@abonten/core/weekly/week";
import Link from "next/link";
import { WeeklyTabs } from "../WeeklyTabs";
import { editionStatusLabel, editionStatusTone } from "../format";
import { EditionCopyForm } from "./EditionCopyForm";
import { EditorProvider } from "./EditorContext";
import { EditorNotice } from "./EditorNotice";
import { PublishPanel } from "./PublishPanel";
import { SectionList } from "./SectionList";
import { ValidationPanel } from "./ValidationPanel";

export default async function WeeklyEditionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionPage("weekly.view");
  const { id } = await params;
  const { ctx, edition, settings, timeZone } = await loadWeeklyEdition(id);

  if (edition.status !== 200 || !edition.data) {
    return (
      <div>
        <PageHeader title="Edition" />
        <WeeklyTabs active="/weekly" />
        <EmptyState>
          {edition.message ?? "This edition could not be loaded."}{" "}
          <Link href="/weekly" className="text-primary underline">
            Back to editions
          </Link>
        </EmptyState>
      </div>
    );
  }

  const doc = edition.data;
  const e = doc.edition;
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <EditorProvider
      editionId={e.id}
      version={e.version}
      canEdit={ctx.permissions.includes("weekly.edit")}
      canPublish={ctx.permissions.includes("weekly.publish")}
      archived={e.status === "archived"}
    >
      <PageHeader
        title={e.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={editionStatusTone(e.status)}>
              {editionStatusLabel(e.status)}
            </Badge>
            <span>
              {e.scopeName} · {formatWeekRange(e.weekStart)}
            </span>
            <span className="text-xs">Version {e.version}</span>
          </span>
        }
        actions={
          <Link
            href="/weekly"
            className="text-sm text-muted-foreground hover:underline"
          >
            All editions
          </Link>
        }
      />
      <WeeklyTabs active="/weekly" />
      <EditorNotice />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <EditionCopyForm
            title={e.title}
            subtitle={e.subtitle}
            intro={e.intro}
          />
          <SectionList sections={doc.sections} />
        </div>
        <aside className="space-y-4">
          <PublishPanel
            edition={e}
            validation={doc.validation}
            stepUpFresh={stepUpFresh}
            defaultHour={settings.data?.settings.defaultPublishHourLocal ?? 6}
            timeZone={timeZone}
          />
          <ValidationPanel
            validation={doc.validation}
            sections={doc.sections}
          />
        </aside>
      </div>
    </EditorProvider>
  );
}
