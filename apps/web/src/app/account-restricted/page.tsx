import SignOutButton from "./SignOutButton";

// Landing for a signed-in account that has been suspended or banned. The
// middleware (src/config/supabase/middleware.ts) redirects every protected
// route here for such an account; an admin ban also revokes their Supabase
// sessions. Deliberately top-level (not under (pages)) so it renders
// without the app header/nav that would only bounce them back here.
export const metadata = {
  title: "Account restricted — Abonten",
};

export default function AccountRestrictedPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          Your account is restricted
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Access to Abonten has been limited for this account. If you think this
          is a mistake, contact support and we&apos;ll take a look.
        </p>
        <div className="pt-2">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
