import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/adminGuard";
import { signOut } from "@/server/actions";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAdmin();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar permissions={ctx.permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <span className="text-xs text-muted-foreground">
            {ctx.roles.length ? ctx.roles.join(" · ") : "no roles"}
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{ctx.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-muted-foreground hover:text-destructive"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
