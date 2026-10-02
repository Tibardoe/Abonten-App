import { describe, expect, it } from "vitest";
import { mergeMessages, pickMessages } from "./pickMessages";

const catalogs = {
  events: {
    title: "Events",
    empty: "Nothing on yet",
    status: { live: "Live", ended: "Ended", draft: "Draft" },
    item1: "First",
    item2: "Second",
    other: "Other",
    form: {
      name: "Name",
      stepOne: "Step one",
      stepTwo: "Step two",
      help: { name: "What people will see" },
    },
  },
  common: { save: "Save", cancel: "Cancel" },
  wallet: { add: "Add a card" },
};

describe("pickMessages", () => {
  it("takes single messages and leaves the rest behind", () => {
    expect(
      pickMessages(catalogs, { events: ["title"], common: ["save"] }),
    ).toEqual({ events: { title: "Events" }, common: { save: "Save" } });
  });

  it('takes a whole namespace for "*"', () => {
    expect(pickMessages(catalogs, { common: "*" })).toEqual({
      common: catalogs.common,
    });
  });

  it("takes a whole group when the entry names one", () => {
    expect(pickMessages(catalogs, { events: ["status"] })).toEqual({
      events: { status: { live: "Live", ended: "Ended", draft: "Draft" } },
    });
  });

  it("takes one message from inside a group", () => {
    expect(
      pickMessages(catalogs, { events: ["status.live", "form.help.name"] }),
    ).toEqual({
      events: {
        status: { live: "Live" },
        form: { help: { name: "What people will see" } },
      },
    });
  });

  it("takes every message whose name starts with a prefix", () => {
    expect(pickMessages(catalogs, { events: ["item*"] })).toEqual({
      events: { item1: "First", item2: "Second" },
    });
    expect(pickMessages(catalogs, { events: ["form.step*"] })).toEqual({
      events: { form: { stepOne: "Step one", stepTwo: "Step two" } },
    });
  });

  it("gives the same answer whatever order the entries come in", () => {
    const wanted = {
      events: { status: catalogs.events.status, title: "Events" },
    };
    expect(
      pickMessages(catalogs, { events: ["status.live", "status", "title"] }),
    ).toEqual(wanted);
    expect(
      pickMessages(catalogs, { events: ["title", "status", "status.live"] }),
    ).toEqual(wanted);
  });

  it("ignores a key, a group or a namespace that is not there", () => {
    expect(
      pickMessages(catalogs, {
        events: ["gone", "status.gone", "title.deeper", "nope*", "x.y*"],
        missing: ["a"],
      }),
    ).toEqual({ events: {} });
  });

  it("never writes to the catalogs it reads from", () => {
    const before = JSON.stringify(catalogs);
    const picked = pickMessages(catalogs, {
      events: ["status.live", "form.name", "form.help", "form.help.name"],
    });
    (picked.events as Record<string, Record<string, string>>).status.added =
      "x";
    expect(JSON.stringify(catalogs)).toBe(before);
  });
});

describe("mergeMessages", () => {
  it("lays one set over another, group by group", () => {
    const root = { common: { save: "Save" }, navigation: { home: "Home" } };
    const segment = {
      common: { cancel: "Cancel" },
      events: { status: { live: "Live" } },
    };
    expect(mergeMessages(root, segment)).toEqual({
      common: { save: "Save", cancel: "Cancel" },
      navigation: { home: "Home" },
      events: { status: { live: "Live" } },
    });
  });

  it("keeps a complete namespace complete when a part of it is laid under", () => {
    const part = { events: { status: { live: "Live" } } };
    const whole = { events: catalogs.events };
    expect(mergeMessages(part, whole)).toEqual({ events: catalogs.events });
  });

  it("changes neither argument", () => {
    const a = { common: { save: "Save" } };
    const b = { common: { cancel: "Cancel" } };
    mergeMessages(a, b);
    expect(a).toEqual({ common: { save: "Save" } });
    expect(b).toEqual({ common: { cancel: "Cancel" } });
  });
});
