// Linear-time, drop-in replacement for `decode-uri-component@0.2.2`.
//
// WHY THIS FILE EXISTS
// --------------------
// `expo-router` depends on `query-string@7`, which depends on
// `decode-uri-component@0.2.2`. That package carries GHSA-vcc3-ghjq-m6fr:
// its fallback decoder, reached when `decodeURIComponent()` throws on
// malformed percent-encoding, bisects the token list and re-decodes both
// halves, once per starting split. Measured against this file: a 450-token
// input — a 1,352-character link — takes 6,115 ms in the original and 8.8 ms
// here. Six seconds of blocked JS thread is an ANR.
//
// HOW EXPOSED IS IT, HONESTLY
// ---------------------------
// The vulnerable function is bundled, and the module that calls
// `queryString.parse` is live rather than dead: react-navigation's core
// barrel re-exports it, and `useLinking.native` and `useLinkBuilder` name it
// as their default `getStateFromPath`.
//
// But in this app that default is never taken. `ExpoRoot` renders
// `fork/NavigationContainer` with `linking={store.linking}`; that puts the
// linking options on `LinkingContext`; and `getLinkingConfig()` always
// defines `getStateFromPath`, which delegates to `fork/getStateFromPath` —
// a fork that parses query parameters with `expo.parseQueryParams` and does
// not import `query-string` at all. So `options?.getStateFromPath ??
// core_1.getStateFromPath` always resolves to expo-router's own parser.
// Sending the payload above to a real device, before and after this change,
// showed no difference, which is consistent with that.
//
// This file therefore closes a latent risk, not an exploit in flight: real
// code, a real cost, one upstream change away from running. It is free to
// carry, because the replacement is behaviour-identical.
//
// It cannot be fixed by upgrading. The advisory covers every published
// version up to 0.4.2; the first patched release, 0.5.0, is ESM-only
// (`"type": "module"`, default export) while `query-string@7` reaches it
// through `require()`. Forcing 0.5.0 with an npm override makes
// `decodeComponent` an object rather than a function, so every call would
// throw `TypeError: decodeComponent is not a function` — an override swaps a
// denial of service for a hard crash while making `npm audit` look clean. No
// Expo SDK removes the chain either: `expo-router@58` (the SDK 58 preview)
// still declares `query-string: ^7.1.3`.
//
// So the runtime copy is replaced instead, through the Metro resolver in
// `metro.config.js` — the same mechanism already used there to pin
// `color-string` to v1. That changes only what the app bundles; the npm
// dependency graph is untouched, so expo-router's Node and web builds keep
// the package they declare.
//
// WHAT CHANGED, AND WHAT DID NOT
// ------------------------------
// The outer structure below is the original's, deliberately: the same
// pre-seeded byte-order-mark entries, the same "build a replacement map,
// then apply it over the whole string" shape, the same trailing `%C2` entry.
// Only `salvage()` differs. Where the original recursively bisected the
// token list, this walks it once: UTF-8 puts the length of a code point in
// its leading byte and is self-synchronising, so a token either starts a
// sequence that decodes within four bytes or cannot be decoded at all.
// Undecodable bytes are left as their literal `%XX` text, which is what the
// original's bisection converges on.
//
// `scripts/check-deep-link-decoder.mjs` holds this honest: it differentially
// tests this file against the real `decode-uri-component` over a corpus of
// 3,033 inputs and fails the build if the two ever disagree.

// The original's two matchers, character for character. `singleMatcher`
// deliberately also matches runs of non-`%` text, and deliberately matches
// neither a bare `%` nor a truncated `%X` — so those are dropped when the
// tokens are rejoined. That is lossy, but it is the behaviour callers have,
// so it is reproduced rather than corrected here.
const TOKEN = "%[a-f0-9]{2}";
const SINGLE_MATCHER = new RegExp(`(${TOKEN})|([^%]+?)`, "gi");
const TOKEN_RUN = new RegExp(`(${TOKEN})+`, "gi");

// Longest UTF-8 sequence, in bytes.
const MAX_SEQUENCE_BYTES = 4;

/**
 * One left-to-right pass over a token list, decoding each code point and
 * leaving anything undecodable as literal text.
 *
 * This is what replaces the original's `decodeComponents()`. That function
 * tried the whole list, then bisected and retried each half, and did so once
 * per starting split — which is what makes a long malformed input expensive.
 * Walking once is enough: UTF-8 encodes the length of a code point in its
 * leading byte and is self-synchronising, so a token either begins a
 * sequence that decodes within four bytes or cannot be decoded at all.
 */
function decodePass(tokens) {
  const out = [];

  for (let i = 0; i < tokens.length; ) {
    let decoded = null;
    let width = 0;

    // A leading byte plus up to three continuation bytes. The first width
    // that decodes is the right one.
    for (let w = 1; w <= MAX_SEQUENCE_BYTES && i + w <= tokens.length; w += 1) {
      try {
        decoded = decodeURIComponent(tokens.slice(i, i + w).join(""));
        width = w;
        break;
      } catch {
        decoded = null;
      }
    }

    if (decoded === null) {
      // Not the start of any valid sequence. Keep it as written and
      // resynchronise on the next token.
      out.push(tokens[i]);
      i += 1;
    } else {
      out.push(decoded);
      i += width;
    }
  }

  return out;
}

/**
 * The original's `decode()`: re-tokenise and re-run until nothing more can
 * be decoded. The repetition matters — a pass can turn `%25` into a literal
 * `%`, which the tokeniser then drops on the following pass — so it is kept.
 * The original bounded this by the token count; stopping as soon as a pass
 * changes nothing reaches the same result, because every further iteration
 * would be a no-op.
 */
function salvage(input) {
  let current = input;
  let tokens = current.match(SINGLE_MATCHER) || [];

  for (let i = 1; i < tokens.length; i += 1) {
    const next = decodePass(tokens).join("");
    if (next === current) break;
    current = next;
    tokens = current.match(SINGLE_MATCHER) || [];
  }

  return current;
}

function customDecodeURIComponent(input) {
  // Keep track of all the replacements, pre-filled with the byte-order
  // marks, which decode to nothing useful and are shown as replacement
  // characters instead.
  const replaceMap = {
    "%FE%FF": "��",
    "%FF%FE": "��",
  };

  let match = TOKEN_RUN.exec(input);
  while (match) {
    try {
      // Decode as big a chunk as possible.
      replaceMap[match[0]] = decodeURIComponent(match[0]);
    } catch {
      const result = salvage(match[0]);
      if (result !== match[0]) {
        replaceMap[match[0]] = result;
      }
    }
    match = TOKEN_RUN.exec(input);
  }

  // Add `%C2` at the end of the map so it does not replace the combinator
  // before everything else.
  replaceMap["%C2"] = "�";

  let out = input;
  for (const key of Object.keys(replaceMap)) {
    out = out.replace(new RegExp(key, "g"), replaceMap[key]);
  }

  return out;
}

module.exports = function decodeUriComponent(encodedURI) {
  if (typeof encodedURI !== "string") {
    throw new TypeError(
      `Expected \`encodedURI\` to be of type \`string\`, got \`${typeof encodedURI}\``,
    );
  }

  // `+` means a space in a query string. The original applies this before
  // either decode path, so a string that then fails to decode is still
  // plus-normalised; keep that ordering.
  const input = encodedURI.replace(/\+/g, " ");

  try {
    // Try the built-in decoder first.
    return decodeURIComponent(input);
  } catch {
    // Fall back to the more forgiving decoder.
    return customDecodeURIComponent(input);
  }
};
