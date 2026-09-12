export const dynamic = "force-dynamic";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

import { getSubjectVerification } from "@/actions/verification/getSubjectVerification";
import { createClient } from "@/config/supabase/server";
import VerificationSection from "@/verification/organisms/VerificationSection";
import Link from "next/link";

// Organizer verification (PROJECT.md §30). There is no organizer entity in
// this schema — an organizer is a user_info row that has created events —
// so the subject here is always the signed-in user themselves, which the
// service enforces rather than trusting the page.
//
// Verification is optional: nothing about creating or publishing an event
// depends on it, by design.
export default async function OrganizerVerificationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        Sign in to manage your organizer verification.
      </p>
    );
  }

  const res = await getSubjectVerification({
    subjectType: "organizer",
    subjectId: user.id,
  });
  const verification = res.status === 200 ? (res.data ?? null) : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-8">
      <div className="space-y-1">
        <Link
          href="/manage/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-xl font-bold">Organizer verification</h1>
        <p className="text-sm text-muted-foreground">
          Show ticket buyers that Abonten has checked who is behind your
          events. This is optional — you can keep creating events either way.
        </p>
      </div>

      <VerificationSection
        subjectType="organizer"
        subjectId={user.id}
        initial={verification}
      />
    </div>
  );
}
