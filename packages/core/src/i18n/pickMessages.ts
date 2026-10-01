// Cutting the catalogs down to what one part of the site reads in the
// browser, and putting the parts back together there.
//
// A selection (i18n/routeMessages.generated.json, written by
// scripts/i18n/gen-route-messages.mjs) names, per namespace, either "*"
// (all of it) or a list of entries:
//
//   "title"          one message
//   "status"         a group: every message under status.
//   "status.item*"   every message of the group whose name starts so

export type Messages = Record<string, unknown>;
export type MessageSelection = Readonly<
  Record<string, "*" | readonly string[]>
>;

const isGroup = (value: unknown): value is Messages =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function copyPath(from: Messages, to: Messages, path: string[]) {
  // The groups on the way down, then the message (or group) itself.
  const groups: Messages[] = [];
  let value: unknown = from;
  for (const name of path) {
    if (!isGroup(value) || !(name in value)) return; // not in the catalog
    groups.push(value);
    value = value[name];
  }
  let target = to;
  for (let i = 0; i < path.length - 1; i++) {
    const name = path[i];
    const existing = target[name];
    // The catalog's own group is already there, whole: nothing to add, and
    // nothing of the catalog's may be written to.
    if (existing === groups[i][name]) return;
    if (isGroup(existing)) target = existing;
    else {
      const fresh: Messages = {};
      target[name] = fresh;
      target = fresh;
    }
  }
  target[path[path.length - 1]] = value;
}

function pickNamespace(
  catalog: Messages,
  entries: readonly string[],
): Messages {
  const out: Messages = {};
  for (const entry of entries) {
    if (!entry.endsWith("*")) {
      copyPath(catalog, out, entry.split("."));
      continue;
    }
    const parts = entry.slice(0, -1).split(".");
    const start = parts.pop() ?? "";
    let group: unknown = catalog;
    for (const part of parts) group = isGroup(group) ? group[part] : undefined;
    if (!isGroup(group)) continue;
    for (const name of Object.keys(group)) {
      if (name.startsWith(start)) copyPath(catalog, out, [...parts, name]);
    }
  }
  return out;
}

/** The messages a selection names, out of every catalog of one language. */
export function pickMessages(
  all: Messages,
  selection: MessageSelection,
): Messages {
  const out: Messages = {};
  for (const [namespace, entries] of Object.entries(selection)) {
    const catalog = all[namespace];
    if (!isGroup(catalog)) continue;
    out[namespace] =
      entries === "*" ? catalog : pickNamespace(catalog, entries);
  }
  return out;
}

/** `extra` laid over `base`, group by group. Neither argument is changed. */
export function mergeMessages(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base };
  for (const [name, value] of Object.entries(extra)) {
    const existing = out[name];
    out[name] =
      isGroup(existing) && isGroup(value)
        ? mergeMessages(existing, value)
        : value;
  }
  return out;
}
