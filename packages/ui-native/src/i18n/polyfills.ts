// The parts of Intl the app's JavaScript engine does not have.
//
// Hermes (the engine every build of the native app runs on) ships
// Intl.NumberFormat and Intl.DateTimeFormat, and nothing else of what the
// translations need: no Intl.PluralRules, no Intl.RelativeTimeFormat, no
// Intl.Locale. Without them:
//
//   - every message with a plural ("{count, plural, one {# ticket} other
//     {# tickets}}") fails to format, and the screen shows the message's
//     key instead ("account.ofStepsDone"), in every language;
//   - "5 minutes ago" stays in English whatever language the app is in
//     (@abonten/core/dateFormatter falls back when the API is missing).
//
// A browser has all of them, which is why the web app, the unit tests and
// the type checker never noticed. These are the standard FormatJS
// polyfills: plain JavaScript (they travel in an over-the-air update), and
// each installs itself only where the engine lacks the real thing. Rules
// are loaded for the languages the app has a catalog for; Akan follows
// British English (see intlTag in I18nProvider.tsx), so "en" covers it.
//
// Imported first in I18nProvider.tsx, before anything formats a message.
// Order matters: PluralRules needs Locale, RelativeTimeFormat needs both.

import "@formatjs/intl-locale/polyfill.js";

import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/fr.js";
import "@formatjs/intl-pluralrules/locale-data/es.js";
import "@formatjs/intl-pluralrules/locale-data/de.js";
import "@formatjs/intl-pluralrules/locale-data/pt.js";

import "@formatjs/intl-relativetimeformat/polyfill.js";
import "@formatjs/intl-relativetimeformat/locale-data/en.js";
import "@formatjs/intl-relativetimeformat/locale-data/fr.js";
import "@formatjs/intl-relativetimeformat/locale-data/es.js";
import "@formatjs/intl-relativetimeformat/locale-data/de.js";
import "@formatjs/intl-relativetimeformat/locale-data/pt.js";
