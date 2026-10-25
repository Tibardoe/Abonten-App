// Tells the IndexNow search engines (Bing — and through it DuckDuckGo,
// Yahoo, Ecosia and ChatGPT search — Yandex, Seznam, Naver) about every page
// in the live sitemap, so they crawl new and changed pages now instead of
// whenever they next come round. Google does not take IndexNow; it reads the
// sitemap (submitted once in Search Console).
//
//   node apps/web/scripts/indexnow-submit.mjs            submit the sitemap
//   node apps/web/scripts/indexnow-submit.mjs --dry-run  list what would go
//
// The key is not a secret: IndexNow checks it by fetching
// https://abontenhub.com/<key>.txt, the file beside this script's
// public/ folder, which proves the submission comes from the site's owner.
// Run it after a deploy that adds or changes public pages. A page that has
// not changed may be submitted again; the engines ignore repeats.

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://abontenhub.com";
const HOST = new URL(ORIGIN).host;
const ENDPOINT = "https://api.indexnow.org/indexnow";
// IndexNow takes at most 10,000 URLs per request.
const BATCH = 10_000;

const here = path.dirname(fileURLToPath(import.meta.url));
const keyFile = readdirSync(path.join(here, "../public")).find((name) =>
  /^[0-9a-f]{32}\.txt$/.test(name),
);
if (!keyFile) throw new Error("No IndexNow key file in apps/web/public");
const key = keyFile.replace(/\.txt$/, "");

const live = await fetch(`${ORIGIN}/${keyFile}`);
if (!live.ok || (await live.text()).trim() !== key) {
  throw new Error(
    `${ORIGIN}/${keyFile} does not serve the key yet: deploy first, then submit`,
  );
}

const sitemap = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
// Each page's own address; the language versions (?hl=) are found from it.
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`${urls.length} pages in the sitemap`);

if (process.argv.includes("--dry-run")) {
  for (const url of urls) console.log(url);
  process.exit(0);
}

for (let i = 0; i < urls.length; i += BATCH) {
  const urlList = urls.slice(i, i + BATCH);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: HOST,
      key,
      keyLocation: `${ORIGIN}/${keyFile}`,
      urlList,
    }),
  });
  // 200 and 202 both mean received; 422 names a URL outside the host.
  console.log(`submitted ${urlList.length}: HTTP ${response.status}`);
  if (response.status >= 400) {
    console.log(await response.text());
    process.exitCode = 1;
  }
}
