#!/usr/bin/env node
// Build (and, where configured, submit) a store build of the mobile app.
//
// Use it when a change needs a new binary — a native module (for example
// modules/volume-observer, the hardware-volume unmute), a new permission or
// plugin in app.json. JavaScript-only changes ship with `eas update` instead.
//
//   npm run release:native -w @abonten/mobile                   # Android + iOS, build then submit
//   npm run release:native -w @abonten/mobile -- --platform ios
//   npm run release:native -w @abonten/mobile -- --no-submit    # build only
//   npm run release:native -w @abonten/mobile -- --dry-run      # print the commands
//
// What it does, in order, stopping at the first failure:
//   1. checks eas-cli is installed and new enough (Apple sign-in needs 24.5.0+)
//      and that you are logged in (`eas whoami`);
//   2. refuses to build from anything but a clean, pushed `main` (a store
//      binary must be reproducible from the repository) unless --allow-branch;
//   3. type-checks the app;
//   4. `eas build --profile production --platform <p> --non-interactive --wait`;
//   5. `eas submit --profile production --platform <p> --latest --non-interactive`
//      for each platform that has a `submit.production.<platform>` entry in
//      eas.json. iOS is configured (App Store Connect / TestFlight, team
//      KDDBR5P4D6). Android has no Play service account in eas.json yet, so
//      its build is left on EAS for a manual upload and the script says so.
//
// Versioning: eas.json uses remote, auto-incremented build numbers. The
// runtime version follows app.json `version`; this script never changes it.
// The volume-observer module is optional at runtime (the app checks for it),
// so JavaScript updates keep working for installs of older binaries and the
// version does not have to move for it. Bump `version` yourself when a
// native change makes new JavaScript incompatible with old binaries.
//
// Credentials stay on EAS: nothing here reads or writes a secret. The first
// iOS production build must have been run interactively once (Apple
// two-factor) — see docs/deployment/mobile-eas.md.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const platformArg = option("--platform", "all");
if (!["android", "ios", "all"].includes(platformArg)) {
  fail(`--platform must be android, ios or all (got "${platformArg}")`);
}
const platforms = platformArg === "all" ? ["android", "ios"] : [platformArg];
const submit = !flag("--no-submit");
const dryRun = flag("--dry-run");
const allowBranch = flag("--allow-branch");
const profile = "production";

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function step(message) {
  console.log(`\n▶ ${message}`);
}

function capture(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, {
    cwd: appDir,
    encoding: "utf8",
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function run(cmd, cmdArgs) {
  console.log(`  $ ${cmd} ${cmdArgs.join(" ")}`);
  if (dryRun) return;
  const res = spawnSync(cmd, cmdArgs, {
    cwd: appDir,
    stdio: "inherit",
    shell: isWindows,
  });
  if (res.status !== 0)
    fail(`${cmd} ${cmdArgs[0]} failed (exit ${res.status})`);
}

function versionAtLeast(actual, wanted) {
  const a = actual.split(".").map(Number);
  const w = wanted.split(".").map(Number);
  for (let i = 0; i < w.length; i++) {
    if ((a[i] ?? 0) !== w[i]) return (a[i] ?? 0) > w[i];
  }
  return true;
}

// 1. eas-cli
step("Checking eas-cli");
let easVersion;
try {
  easVersion = capture("eas", ["--version"]).match(/(\d+\.\d+\.\d+)/)?.[1];
} catch {
  fail("eas-cli is not installed. Install it with: npm install -g eas-cli");
}
if (!easVersion || !versionAtLeast(easVersion, "24.5.0")) {
  fail(`eas-cli ${easVersion ?? "?"} is too old; 24.5.0 or newer is needed.`);
}
console.log(`  eas-cli ${easVersion}`);
if (!dryRun) {
  try {
    console.log(`  logged in as ${capture("eas", ["whoami"]).split("\n")[0]}`);
  } catch {
    fail("Not logged in to EAS. Run: eas login");
  }
}

// 2. clean, pushed main
step("Checking the git tree");
const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const dirty = capture("git", ["status", "--porcelain"]);
if (dirty)
  fail("The working tree has uncommitted changes. Commit or stash them first.");
if (branch !== "main" && !allowBranch) {
  fail(
    `On "${branch}". Store builds come from main (pass --allow-branch to override).`,
  );
}
try {
  capture("git", ["fetch", "origin", branch]);
  const behindAhead = capture("git", [
    "rev-list",
    "--left-right",
    "--count",
    `origin/${branch}...HEAD`,
  ]);
  const [behind, ahead] = behindAhead.split(/\s+/).map(Number);
  if (behind > 0)
    fail(`${branch} is ${behind} commit(s) behind origin. Pull first.`);
  if (ahead > 0) fail(`${branch} has ${ahead} unpushed commit(s). Push first.`);
} catch (e) {
  if (e?.status !== undefined) fail(`Could not compare with origin/${branch}.`);
  throw e;
}
const commit = capture("git", ["rev-parse", "--short", "HEAD"]);
const appVersion = JSON.parse(readFileSync(join(appDir, "app.json"), "utf8"))
  .expo.version;
console.log(`  ${branch} @ ${commit}, app version ${appVersion}`);

// 3. type-check
step("Type-checking the app");
run("npx", ["tsc", "--noEmit"]);

// 4 + 5. build, then submit where configured
const easJson = JSON.parse(readFileSync(join(appDir, "eas.json"), "utf8"));
for (const platform of platforms) {
  step(`Building ${platform} (${profile})`);
  run("eas", [
    "build",
    "--profile",
    profile,
    "--platform",
    platform,
    "--non-interactive",
    "--wait",
    "--message",
    // No spaces: on Windows the command runs through a shell (for the
    // eas.cmd shim), which would split a spaced message into extra args.
    `release-native-${commit}`,
  ]);

  if (!submit) continue;
  if (!easJson.submit?.[profile]?.[platform]) {
    console.log(
      `\n  ⚠ No submit.${profile}.${platform} in eas.json, so the ${platform} build was not submitted.` +
        (platform === "android"
          ? " Download it from expo.dev (or add a Play service account key to eas.json) and upload it in Play Console."
          : ""),
    );
    continue;
  }
  step(`Submitting ${platform}`);
  run("eas", [
    "submit",
    "--profile",
    profile,
    "--platform",
    platform,
    "--latest",
    "--non-interactive",
  ]);
}

console.log(
  `\n✔ Done${dryRun ? " (dry run — nothing was built)" : ""}. iOS builds appear in TestFlight after Apple's processing; test the new binary before releasing it.`,
);
