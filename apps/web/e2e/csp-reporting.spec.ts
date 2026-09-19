import { expect, test } from "@playwright/test";

// The policy names a `report-uri`, but a header that merely *looks* right
// proves nothing: what matters is that a browser, given this policy, blocks
// a disallowed load and posts a violation report to that endpoint. Sentry's
// acceptance of the report is Sentry's business, so the request is
// intercepted here and inspected instead of being sent.

function directive(policy: string, name: string): string[] | null {
  const entry = policy
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `));
  return entry
    ? entry.slice(name.length).trim().split(" ").filter(Boolean)
    : null;
}

test("a blocked load produces a CSP violation report addressed to the configured endpoint", async ({
  page,
  request,
}) => {
  const header = (await request.get("/")).headers()["content-security-policy"];
  expect(header, "no CSP on the response").toBeTruthy();

  const reportUri = directive(header, "report-uri")?.[0];
  test.skip(
    !reportUri,
    "no Sentry DSN configured in this environment, so the policy carries no report-uri",
  );

  // Catch the report before it leaves the machine.
  const reports: string[] = [];
  await page.route(`${reportUri?.split("?")[0]}*`, async (route) => {
    reports.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, body: "" });
  });

  await page.goto("/");

  // A script from an origin the policy does not allow. The browser must
  // refuse it and report the refusal.
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.src = "https://csp-violation.example.com/blocked.js";
    document.head.appendChild(s);
  });

  await expect
    .poll(() => reports.length, {
      message: "the browser sent no CSP report for a blocked script",
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  const body = reports[0];
  expect(body, "the report body was empty").toBeTruthy();
  const parsed = JSON.parse(body) as {
    "csp-report"?: { "violated-directive"?: string; "blocked-uri"?: string };
  };
  const report = parsed["csp-report"];
  expect(report, "not a csp-report payload").toBeTruthy();
  expect(report?.["violated-directive"]).toContain("script-src");
  expect(report?.["blocked-uri"]).toContain("csp-violation.example.com");
});

test("the policy blocks a disallowed script but still runs the app's own", async ({
  page,
}) => {
  const blocked: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) blocked.push(t);
  });

  await page.goto("/");
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.src = "https://csp-violation.example.com/blocked.js";
    document.head.appendChild(s);
  });
  await expect
    .poll(() => blocked.length, { timeout: 10_000 })
    .toBeGreaterThan(0);

  // Only the foreign script may be refused. If the policy were too tight to
  // ship, the app's own chunks would be refused too and would show up here.
  const ownOrigin = new URL(page.url()).origin;
  const selfRefusals = blocked.filter((m) => m.includes(ownOrigin));
  expect(
    selfRefusals,
    "the policy refused the app's own scripts or styles",
  ).toEqual([]);

  // …and the page still rendered and hydrated under that policy.
  const rendered = await page.evaluate(() => ({
    nodes: document.body.querySelectorAll("*").length,
    links: document.querySelectorAll("a[href]").length,
  }));
  // The landing page is deliberately spare; this only has to distinguish
  // "rendered" from "blank because the policy killed the bundle".
  expect(rendered.nodes).toBeGreaterThan(10);
  expect(rendered.links).toBeGreaterThan(0);
});
