// Sentry init for the Node.js server runtime of the admin console (Server
// Components, Route Handlers, Server Actions). Imported from
// src/instrumentation.ts when NEXT_RUNTIME === "nodejs".
//
// All the actual configuration — gating, environment resolution, error
// filtering, sensitive-data redaction — lives in ./lib/sentry so the
// three runtime entrypoints can't drift apart. Events land in the
// `abonten-admin` Sentry project (the DSN, set per Vercel project, routes
// them there).

import * as Sentry from "@sentry/nextjs";
import { adminSentryOptions } from "./lib/sentry";

Sentry.init(adminSentryOptions("server"));
