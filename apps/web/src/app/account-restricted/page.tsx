import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import Link from "next/link";
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
          is a mistake, email{" "}
          <a
            href={mailto(SUPPORT_EMAIL, "Restricted account")}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on your account and we&apos;ll take a look.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <Link
            href="/help/account/restricted-accounts"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            What a restricted account means and how to reach support
          </Link>
          {" · "}
          <Link
            href="/legal/terms"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Terms and Conditions
          </Link>
        </p>
        <div className="pt-2">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
