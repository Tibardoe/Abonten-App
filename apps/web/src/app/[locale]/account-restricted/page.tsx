import { SUPPORT_EMAIL, mailto } from "@abonten/core/brand/contacts";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

// Landing for a signed-in account that has been suspended or banned. The
// middleware (src/config/supabase/middleware.ts) redirects every protected
// route here for such an account; an admin ban also revokes their Supabase
// sessions. Deliberately top-level (not under (pages)) so it renders
// without the app header/nav that would only bounce them back here.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return {
    title: t("accountRestricted"),
  };
}

export default function AccountRestrictedPage() {
  const t = useTranslations("auth");

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          {t("yourAccountIsRestricted")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t.rich("accessLimitedWriteToSupport", {
            email: SUPPORT_EMAIL,
            link: (chunks) => (
              <a
                href={mailto(SUPPORT_EMAIL, t("restrictedAccount"))}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <Link
            href="/help/account/restricted-accounts"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("whatARestrictedAccountMeansAnd")}
          </Link>
          {" · "}
          <Link
            href="/legal/terms"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("termsAndConditions")}
          </Link>
        </p>
        <div className="pt-2">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
