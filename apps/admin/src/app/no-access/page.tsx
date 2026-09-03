import { signOut } from "@/server/actions";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">No access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This account isn&apos;t authorized for the operations console.
        </p>
        <form action={signOut} className="mt-5">
          <button
            type="submit"
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border px-4 text-sm hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
