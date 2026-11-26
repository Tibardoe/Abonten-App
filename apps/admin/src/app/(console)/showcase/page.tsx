import { Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadShowcase } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { ShowcaseAddPanel } from "./ShowcaseAddPanel";
import { ShowcaseEntryList } from "./ShowcaseEntryList";
import { ShowcaseSettingsForm } from "./ShowcaseSettingsForm";

// Admin › Showcase (docs/admin/showcase.md): who is on the "On Abonten" wall
// of each market. Staff add hosts (organizers, people or teams) and places,
// set their order, an optional city and a note, and take them off. Whether
// an entry shows is worked out on every read: the list says so, and why
// not. The wall shows a row only with enough entries that qualify (the
// settings' minimum). The console is English-only.

export default async function ShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  await requirePermissionPage("showcase.view");
  const { market } = await searchParams;
  const { ctx, view, settings } = await loadShowcase({ market });
  const canEdit = ctx.permissions.includes("showcase.edit");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const data = view.status === 200 ? view.data : undefined;
  const config = settings.status === 200 ? settings.data : undefined;
  const minPerRow = config?.settings.minPerRow ?? 4;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Showcase"
        description="The “On Abonten” wall on the website and in the app: hosts and places, two rows that drift slowly. Pick who is on it per market. An entry shows only while it qualifies (an active account, an upcoming event for a host, a place someone runs), and a row shows only with enough entries that qualify."
      />

      {config && !config.settings.enabled ? (
        <Card className="border-warning/40 p-3 text-sm">
          The wall is switched off: nobody sees it. Build the list here, then
          switch it on for staff in the settings below to check it on the
          website and in the app.
        </Card>
      ) : null}
      {config?.killSwitch ? (
        <Card className="border-destructive/40 p-3 text-sm">
          SHOWCASE_KILL_SWITCH is set on this deployment. The wall is hidden
          everywhere until it is removed, whatever these settings say.
        </Card>
      ) : null}

      {!data ? (
        <EmptyState>{view.message ?? "Couldn't load the showcase."}</EmptyState>
      ) : (
        <>
          <nav
            aria-label="Market"
            className="flex flex-wrap items-center gap-2"
          >
            {data.markets.map((m) => (
              <Link
                key={m.countryCode}
                href={`/showcase?market=${m.countryCode}`}
                aria-current={
                  m.countryCode === data.countryCode ? "page" : undefined
                }
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  m.countryCode === data.countryCode
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {m.name}
                {m.status !== "live" ? ` (${m.status})` : ""}
              </Link>
            ))}
          </nav>

          <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            {(
              [
                ["Hosts", data.showing.hosts],
                ["Places", data.showing.places],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <p className="font-semibold">
                  {label}: {count} showing now
                </p>
                <p className="text-xs text-muted-foreground">
                  {count >= minPerRow
                    ? "The row shows on the wall."
                    : `The row is hidden until ${minPerRow} qualify (${minPerRow - count} more).`}
                </p>
              </div>
            ))}
          </Card>

          {canEdit ? (
            <ShowcaseAddPanel
              countryCode={data.countryCode}
              cities={data.cities}
            />
          ) : null}

          <ShowcaseEntryList
            entries={data.entries}
            cities={data.cities}
            canEdit={canEdit}
          />
        </>
      )}

      {config ? (
        <ShowcaseSettingsForm
          settings={config.settings}
          canEdit={canEdit}
          stepUpFresh={stepUpFresh}
        />
      ) : (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      )}
    </div>
  );
}
