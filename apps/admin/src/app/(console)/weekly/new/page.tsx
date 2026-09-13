import { EmptyState, PageHeader } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadWeeklyEditions } from "@/lib/data";
import { nextWeekStart } from "@abonten/core/weekly/week";
import { WeeklyTabs } from "../WeeklyTabs";
import { NewEditionForm } from "./NewEditionForm";

export default async function NewWeeklyEditionPage() {
  await requirePermissionPage("weekly.edit");
  const { editions, scopes } = await loadWeeklyEditions();

  const activeScopes = (scopes.data ?? []).filter((s) => s.status === "active");

  return (
    <div>
      <PageHeader
        title="New edition"
        description="Pick the area and the week. You can start from the default sections or copy an earlier edition."
      />
      <WeeklyTabs active="/weekly" />
      {activeScopes.length === 0 ? (
        <EmptyState>Add an active area first.</EmptyState>
      ) : (
        <NewEditionForm
          scopes={activeScopes}
          editions={editions.data ?? []}
          defaultWeek={nextWeekStart()}
        />
      )}
    </div>
  );
}
