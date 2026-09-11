import { Button } from "@/components/ui/button";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { createClient } from "@/config/supabase/server";
import InviteAcceptButton from "@/rewards/molecules/InviteAcceptButton";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { ANDROID_APP_LISTED, playStoreUrl } from "@abonten/core/rewards/invite";
import { resolveReferralCodeCore } from "@abonten/services/rewards/inviteCore";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// A friend's invite: abontenhub.com/invite/CODE. The proxy has already
// remembered the code in the signed referral cookie by the time this renders,
// so signing up from here (any method) applies it afterwards.

const resolve = cache(async (code: string) => {
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return resolveReferralCodeCore(code, ip);
});

function offerLine(
  welcomeMinor: number | null,
  minOrderMinor: number | null,
): string | null {
  if (!welcomeMinor) return null;
  return `Get ${formatCredit(welcomeMinor)} off your first ticket${
    minOrderMinor ? ` of ${formatCredit(minOrderMinor)} or more` : ""
  }.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const { data } = await resolve(code);
  if (!data?.valid) return { title: "Join Abonten Hub" };

  const title = `${data.referrerName ?? "A friend"} invited you to Abonten`;
  const description =
    (data.programOn
      ? offerLine(data.welcomeMinor, data.minOrderMinor)
      : null) ?? "Find events and places near you.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [{ status, data }, supabase] = await Promise.all([
    resolve(code),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (status === 429) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
        <PageTitle>Too many requests</PageTitle>
        <SupportingText>Wait a minute and open the link again.</SupportingText>
      </section>
    );
  }

  if (!data?.valid) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
        <PageTitle>This invite link isn&apos;t valid</PageTitle>
        <SupportingText>
          Check the link with the person who sent it. You can still explore
          what&apos;s on near you.
        </SupportingText>
        <Button asChild className="mt-2">
          <Link href="/">Explore Abonten</Link>
        </Button>
      </section>
    );
  }

  const name = data.referrerName ?? "A friend";
  const offer = data.programOn
    ? offerLine(data.welcomeMinor, data.minOrderMinor)
    : null;
  const avatar = data.referrerAvatar
    ? buildCloudinaryUrl(
        data.referrerAvatar.publicId,
        data.referrerAvatar.version ?? "",
        { width: 160, height: 160 },
      )
    : null;

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-5 py-10 text-center">
      {avatar ? (
        <Image
          src={avatar}
          alt=""
          width={80}
          height={80}
          className="h-20 w-20 rounded-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-3xl font-semibold"
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <PageTitle className="text-balance">
          {name} invited you to Abonten
        </PageTitle>
        <SupportingText>
          Find events and places near you, buy tickets in a few taps, and keep
          them on your phone.
        </SupportingText>
      </div>

      {offer ? (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm font-medium">
          {offer}{" "}
          <span className="font-normal text-muted-foreground">
            Verify your phone number after you sign up to get it.
          </span>
        </p>
      ) : null}

      {user ? (
        <InviteAcceptButton code={data.code ?? code} />
      ) : (
        <div className="flex w-full flex-col gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href="/auth/signin">Sign up to join</Link>
          </Button>
          {ANDROID_APP_LISTED ? (
            <Button asChild size="lg" variant="outline" className="w-full">
              <a href={playStoreUrl(data.code)}>Get the Android app</a>
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Invite codes work for new accounts, in their first week.
          </p>
        </div>
      )}
    </section>
  );
}
