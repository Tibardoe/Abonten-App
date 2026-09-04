// Sentry init for the Edge runtime (proxy.ts / middleware). Imported from
// src/instrumentation.ts when NEXT_RUNTIME === "edge". Same shared config
// as the Node server runtime — see ./lib/sentry.

import * as Sentry from "@sentry/nextjs";
import { adminSentryOptions } from "./lib/sentry";

Sentry.init(adminSentryOptions("edge"));
