/**
 * Abonten uptime watch.
 *
 * Runs every 5 minutes as a Google Apps Script project ("Abonten uptime
 * watch") on the founder's Google Workspace account, outside Vercel, Supabase
 * and GitHub. It emails when the website, the app's API (and the database
 * behind it), the admin console or Supabase stop answering, and again when
 * they come back. Every Monday morning it sends a short "still watching" note.
 *
 * Why it exists: from 13 to 15 November 2026 the website, the admin console
 * and the app's API were down for two days and nobody was told, because the
 * incident emails are sent by the website itself. This watcher shares nothing
 * with the services it watches.
 *
 * This file is the source of truth. To change the watcher, edit this file,
 * paste it over Code.gs in the Apps Script project and save (see
 * docs/operations/uptime-watch.md). Run setup() again only if the triggers
 * need recreating.
 */

// Who is emailed: the script property ALERT_TO (Project Settings > Script
// Properties), one address or several separated by commas. Kept out of this
// file because the repository is public.
function alertTo() {
  var to = PropertiesService.getScriptProperties().getProperty("ALERT_TO");
  if (!to) throw new Error("Set the ALERT_TO script property (Project Settings > Script Properties).");
  return to;
}

// Two failed runs in a row (about 10 minutes) before an alert, so a single
// slow answer does not wake anyone up.
var FAILS_BEFORE_ALERT = 2;

var CHECKS = [
  {
    key: "website",
    name: "Website (abontenhub.com)",
    url: "https://abontenhub.com/",
    ok: function (r) {
      return r.code === 200;
    },
    whatToDo:
      "Open the Vercel dashboard (project abonten): latest deployment, usage and billing. A 402 means Vercel has blocked the account.",
  },
  {
    key: "api",
    name: "App API and database",
    // Public, read-only, used by the app at start-up; answers 200 with the
    // markets from the database. A 200 without them means the database
    // did not answer.
    url: "https://abontenhub.com/api/mobile/markets/context",
    ok: function (r) {
      return r.code === 200 && r.body.indexOf('"countryCode":"GH"') !== -1;
    },
    whatToDo:
      "The app cannot load. Check the Vercel dashboard (project abonten) first, then the Supabase dashboard (project Abonten) and https://status.supabase.com.",
  },
  {
    key: "admin",
    name: "Admin console (admin.abontenhub.com)",
    url: "https://admin.abontenhub.com/",
    ok: function (r) {
      return r.code === 200 || r.code === 302 || r.code === 307 || r.code === 308;
    },
    whatToDo:
      "Open the Vercel dashboard (project abonten-app-admin): latest deployment, usage and billing.",
  },
  {
    key: "supabase",
    name: "Supabase (the database provider)",
    // Without a key the gateway answers 401 "No API key found": that still
    // proves it is up. Anything 5xx or no answer means it is not.
    url: "https://sderrexhawjbmsugndcq.supabase.co/auth/v1/health",
    ok: function (r) {
      return r.code === 200 || r.code === 401;
    },
    whatToDo:
      "Check https://status.supabase.com and the Supabase dashboard (project Abonten). Sign-in, the app and the website all depend on it.",
  },
];

function probe(check) {
  var started = Date.now();
  try {
    var res = UrlFetchApp.fetch(check.url, {
      muteHttpExceptions: true,
      followRedirects: false,
      headers: { "User-Agent": "AbontenUptimeWatch/1.0" },
    });
    return {
      code: res.getResponseCode(),
      body: check.key === "api" ? res.getContentText().slice(0, 4000) : "",
      ms: Date.now() - started,
      error: null,
    };
  } catch (e) {
    return { code: 0, body: "", ms: Date.now() - started, error: String(e) };
  }
}

function describe(r) {
  if (r.error) return "No answer (" + r.error + ")";
  if (r.code === 402)
    return "HTTP 402: Vercel has blocked the deployment (plan or usage limit).";
  if (r.code >= 500) return "HTTP " + r.code + ": the server answered with an error.";
  if (r.code === 200) return "HTTP 200, but without the expected content.";
  return "HTTP " + r.code + ", not what a healthy service answers.";
}

function readState(props, key) {
  var raw = props.getProperty("state_" + key);
  return raw ? JSON.parse(raw) : { fails: 0, downSince: null, alerted: false };
}

function runChecks() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var now = new Date();
    CHECKS.forEach(function (check) {
      var r = probe(check);
      var up = !r.error && check.ok(r);
      var state = readState(props, check.key);
      if (up) {
        if (state.alerted) sendRecovered(check, state, now);
        state = { fails: 0, downSince: null, alerted: false };
      } else {
        state.fails += 1;
        if (!state.downSince) state.downSince = now.toISOString();
        state.last = describe(r);
        if (state.fails >= FAILS_BEFORE_ALERT && !state.alerted) {
          sendDown(check, state);
          state.alerted = true;
          logIncident(props, check, state.downSince);
        }
      }
      props.setProperty("state_" + check.key, JSON.stringify(state));
    });
    props.setProperty("lastRun", now.toISOString());
  } finally {
    lock.releaseLock();
  }
}

function minutesSince(iso, now) {
  return Math.max(1, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
}

function sendDown(check, state) {
  MailApp.sendEmail(
    alertTo(),
    "🔴 Abonten: " + check.name + " is down",
    [
      check.name + " has not answered properly since " + new Date(state.downSince).toUTCString() + ".",
      "",
      "Latest answer: " + state.last,
      "Checked address: " + check.url,
      "",
      "What to do: " + check.whatToDo,
      "",
      "You will get another email when it is back. This watcher checks every 5 minutes from Google, outside Vercel and Supabase.",
    ].join("\n"),
  );
}

function sendRecovered(check, state, now) {
  MailApp.sendEmail(
    alertTo(),
    "✅ Abonten: " + check.name + " is back",
    check.name +
      " is answering again. It was down for about " +
      minutesSince(state.downSince, now) +
      " minutes (from " +
      new Date(state.downSince).toUTCString() +
      ").",
  );
}

function logIncident(props, check, downSince) {
  var log = JSON.parse(props.getProperty("incidents") || "[]");
  log.push({ check: check.name, downSince: downSince });
  props.setProperty("incidents", JSON.stringify(log.slice(-50)));
}

function weeklyHeartbeat() {
  var props = PropertiesService.getScriptProperties();
  var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  var log = JSON.parse(props.getProperty("incidents") || "[]");
  var recent = log.filter(function (i) {
    return new Date(i.downSince).getTime() >= weekAgo;
  });
  var lines = recent.length
    ? recent.map(function (i) {
        return "- " + i.check + ", from " + new Date(i.downSince).toUTCString();
      })
    : ["- None."];
  MailApp.sendEmail(
    alertTo(),
    "Abonten uptime watch: still watching",
    ["The uptime watch is running. Last check: " + (props.getProperty("lastRun") || "never") + ".", "", "Outages in the last 7 days:"]
      .concat(lines)
      .join("\n"),
  );
  props.setProperty("incidents", JSON.stringify(recent));
}

// Run once by hand: replaces the triggers, then checks immediately.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runChecks").timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger("weeklyHeartbeat").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  runChecks();
}

// Run by hand to see what an alert looks like.
function sendTestAlert() {
  MailApp.sendEmail(
    alertTo(),
    "🧪 Abonten uptime watch: test alert",
    "This is a test. If the website, the app's API, the admin console or Supabase stop answering for about 10 minutes, an email like this one tells you what is down and what to check.",
  );
}

// Run by hand to see every check's answer right now (in the execution log).
function checkNow() {
  CHECKS.forEach(function (check) {
    var r = probe(check);
    Logger.log(check.name + ": " + (!r.error && check.ok(r) ? "up" : "DOWN, " + describe(r)) + " (" + r.ms + " ms)");
  });
}
