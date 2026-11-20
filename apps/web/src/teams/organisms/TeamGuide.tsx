import { PageTitle } from "@/components/ui/typography";
import GuidePhone from "@/teams/atoms/GuidePhone";
import { TEAM_ROLES } from "@abonten/core/teams/roles";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// The public team accounts guide (/teams): what a team is, the four steps
// to set one up, what each role can do. Server-rendered and static; the
// phone pictures are drawn sketches with the app's own words, not
// screenshots.

const path = (chunks: React.ReactNode) => (
  <span className="font-semibold text-primary">{chunks}</span>
);
const bold = (chunks: React.ReactNode) => (
  <strong className="font-semibold text-foreground">{chunks}</strong>
);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2 py-1.5 text-muted-foreground">
      <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-foreground">
        {label}
      </span>
      {value}
    </div>
  );
}

function Pill({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        on
          ? "rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground"
          : "rounded-full bg-muted px-2 py-0.5 font-semibold"
      }
    >
      {children}
    </span>
  );
}

function Fill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg bg-primary py-1.5 text-center font-semibold text-primary-foreground">
      {children}
    </span>
  );
}

function ScreenBar({ title, where }: { title: string; where: string }) {
  return (
    <div className="flex items-center justify-between text-sm font-semibold">
      <span>{title}</span>
      <span className="text-xs text-muted-foreground">{where}</span>
    </div>
  );
}

function Step({
  number,
  title,
  body,
  points,
  tip,
  sketch,
}: {
  number: number;
  title: string;
  body: React.ReactNode;
  points: string[];
  tip?: React.ReactNode;
  sketch: React.ReactNode;
}) {
  return (
    <li className="grid items-center gap-6 rounded-2xl border border-border bg-card p-5 md:grid-cols-[minmax(0,1fr)_240px] md:p-6">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
          >
            {number}
          </span>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <p>{body}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {tip ? (
          <p className="rounded-xl bg-primary/10 p-3 text-sm">{tip}</p>
        ) : null}
      </div>
      {sketch}
    </li>
  );
}

export default async function TeamGuide() {
  const t = await getTranslations("teams");
  const g = (key: string, values?: Record<string, string>) =>
    t(`guide.${key}`, values);
  const caption = g("sketchCaption");
  const business = g("yourBusiness");

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-14 py-6">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {g("eyebrow")}
        </p>
        <PageTitle className="text-3xl md:text-4xl">{g("title")}</PageTitle>
        <p className="max-w-prose text-lg text-muted-foreground">{g("lede")}</p>
      </header>

      <section aria-labelledby="fits" className="flex flex-col gap-4">
        <h2 id="fits" className="text-2xl font-semibold">
          {g("fitsTitle")}
        </h2>
        <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)]">
            <div className="flex flex-col gap-1 rounded-xl border-2 border-primary bg-primary/10 p-4">
              <span className="text-lg font-semibold">{business}</span>
              <span className="text-sm text-muted-foreground">
                {g("teamAccountBody")}
              </span>
            </div>
            <span
              aria-hidden="true"
              className="justify-self-center text-2xl font-semibold text-primary md:rotate-0 rotate-90"
            >
              ⟷
            </span>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(["owner", "finance", "manager", "door"] as const).map(
                (role, i) => (
                  <li
                    key={role}
                    className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold"
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">
                        {t("role", { role })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {g("ownSignIn")}
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
          <p className="text-muted-foreground">{g("fitsNote")}</p>
        </div>
      </section>

      <section aria-labelledby="steps" className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {g("stepsEyebrow")}
          </p>
          <h2 id="steps" className="text-2xl font-semibold">
            {g("stepsTitle")}
          </h2>
        </div>
        <ol className="flex flex-col gap-5">
          <Step
            number={1}
            title={g("step1Title")}
            body={t.rich("guide.step1Body", { path })}
            points={[g("step1Point1"), g("step1Point2"), g("step1Point3")]}
            tip={t.rich("guide.step1Tip", { b: bold })}
            sketch={
              <GuidePhone label={t("createTitle")} caption={caption}>
                <ScreenBar title={t("createTitle")} where={t("title")} />
                <p className="text-muted-foreground">{t("createBody")}</p>
                <Field label={t("nameLabel")} value={business} />
                <Field label={t("usernameLabel")} value={g("sketchHandle")} />
                <span className="flex gap-1.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 size-3 shrink-0 rounded bg-primary"
                  />
                  {t("adultConfirm")}
                </span>
                <Fill>{t("create")}</Fill>
              </GuidePhone>
            }
          />
          <Step
            number={2}
            title={g("step2Title")}
            body={t.rich("guide.step2Body", { path })}
            points={[g("step2Point1"), g("step2Point2"), g("step2Point3")]}
            sketch={
              <GuidePhone label={t("inviteTitle")} caption={caption}>
                <ScreenBar title={t("invite")} where={business} />
                <span className="flex flex-wrap gap-1.5">
                  <Pill on>{t("byUsername")}</Pill>
                  <Pill>{t("byPhone")}</Pill>
                </span>
                <Field label={t("usernameLabel")} value={g("sketchTeammate")} />
                <span className="text-[0.65rem] font-semibold uppercase tracking-wide">
                  {t("roleLabel")}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {TEAM_ROLES.map((role) => (
                    <Pill key={role} on={role === "manager"}>
                      {t("role", { role })}
                    </Pill>
                  ))}
                </span>
                <Fill>{t("sendInvite")}</Fill>
              </GuidePhone>
            }
          />
          <Step
            number={3}
            title={g("step3Title")}
            body={t.rich("guide.step3Body", { path, b: bold })}
            points={[g("step3Point1"), g("step3Point2")]}
            sketch={
              <GuidePhone label={t("invitationsTitle")} caption={caption}>
                <ScreenBar title={t("title")} where={t("invitationsTitle")} />
                <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
                  <span>
                    <strong className="block">{business}</strong>
                    <span className="text-muted-foreground">
                      {g("sketchInviteRole", {
                        role: t("role", { role: "manager" }),
                      })}
                    </span>
                  </span>
                  <span className="grid grid-cols-2 gap-1.5">
                    <Fill>{t("accept")}</Fill>
                    <span className="rounded-lg border border-border py-1.5 text-center font-semibold">
                      {t("decline")}
                    </span>
                  </span>
                </div>
                <strong>{t("yourTeams")}</strong>
                <span className="rounded-lg border border-border p-2 text-muted-foreground">
                  {t("noTeams")}
                </span>
              </GuidePhone>
            }
          />
          <Step
            number={4}
            title={g("step4Title")}
            body={t.rich("guide.step4Body", { path, b: bold })}
            points={[g("step4Point1"), g("step4Point2")]}
            sketch={
              <GuidePhone label={t("managingAs")} caption={caption}>
                <ScreenBar
                  title={g("sketchOrganizer")}
                  where={t("managingAs")}
                />
                <span className="flex flex-col overflow-hidden rounded-lg border border-border">
                  <span className="px-2 py-1.5">{t("yourAccount")}</span>
                  <span className="border-t border-border bg-primary/10 px-2 py-1.5 font-semibold">
                    {business} · {t("role", { role: "manager" })}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5 rounded-lg border border-border p-2">
                  <strong>{g("sketchEvents")}</strong>
                  <span className="text-muted-foreground">
                    {g("sketchEventsBody")}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5 rounded-lg border border-border p-2">
                  <strong>{t("publishingAs", { name: business })}</strong>
                  <span className="text-muted-foreground">
                    {g("sketchCustomersSee")}
                  </span>
                </span>
              </GuidePhone>
            }
          />
        </ol>
      </section>

      <section aria-labelledby="roles" className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {g("rolesEyebrow")}
          </p>
          <h2 id="roles" className="text-2xl font-semibold">
            {g("rolesTitle")}
          </h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM_ROLES.map((role) => (
            <li
              key={role}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
            >
              <h3 className="flex items-center gap-2 font-semibold">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full bg-primary"
                />
                {t("role", { role })}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("guide.roleBody", { role })}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="example" className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {g("exampleEyebrow")}
          </p>
          <h2 id="example" className="text-2xl font-semibold">
            {g("exampleTitle")}
          </h2>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-primary/10 text-xs uppercase tracking-wide">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {g("exampleWho")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {g("exampleRole")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["exampleOwner", "owner"],
                  ["exampleFinance", "finance"],
                  ["exampleManager", "manager"],
                  ["exampleContent", "content"],
                  ["exampleDoor", "door"],
                ] as const
              ).map(([who, role]) => (
                <tr key={role} className="border-t border-border">
                  <td className="px-4 py-3">{g(who)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {t("role", { role })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="notes" className="flex flex-col gap-4">
        <h2 id="notes" className="text-2xl font-semibold">
          {g("notesTitle")}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-primary">
          <li>{g("note1")}</li>
          <li>{g("note2")}</li>
          <li>{g("note3")}</li>
          <li>{g("note4")}</li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/go/app"
            className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {g("getApp")}
          </Link>
          <Link
            href="/help/organizers/team-accounts"
            className="rounded-full border border-border px-5 py-2.5 font-semibold hover:bg-muted"
          >
            {g("readHelp")}
          </Link>
        </div>
      </section>
    </article>
  );
}
