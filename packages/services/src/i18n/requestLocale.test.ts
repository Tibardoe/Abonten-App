import { translateServerText } from "@abonten/i18n/server";
import { describe, expect, it } from "vitest";
import {
  coreT,
  localeOfRequest,
  requestLocale,
  runWithLocale,
  tr,
  trFor,
} from "./requestLocale";

const request = (headers: Record<string, string>) => ({
  headers: {
    get: (name: string) => headers[name.toLowerCase()] ?? null,
  },
});

describe("the language of a request", () => {
  it("is English when nothing asked for one (a cron job, a webhook)", () => {
    expect(requestLocale()).toBe("en");
    expect(tr("notAuthenticated")).toBe("Not authenticated");
  });

  it("is the app's own Language setting before the device's", () => {
    expect(
      localeOfRequest(
        request({ "x-abonten-locale": "fr", "accept-language": "de-DE,de" }),
      ),
    ).toBe("fr");
  });

  it("reads the device's languages in order of preference", () => {
    expect(
      localeOfRequest(
        request({ "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" }),
      ),
    ).toBe("pt");
    expect(
      localeOfRequest(
        request({ "accept-language": "zh-CN,zh;q=0.9,es;q=0.5" }),
      ),
    ).toBe("es");
  });

  it("falls back to English for a language Abonten does not have", () => {
    expect(localeOfRequest(request({ "accept-language": "ja-JP,ja" }))).toBe(
      "en",
    );
    expect(localeOfRequest(request({ "x-abonten-locale": "xx" }))).toBe("en");
    expect(localeOfRequest(request({}))).toBe("en");
  });

  it("gives a service's words in the requester's language", () => {
    expect(runWithLocale("fr", () => tr("notAuthenticated"))).toBe(
      "Non authentifié",
    );
    expect(runWithLocale("fr", () => requestLocale())).toBe("fr");
    // Outside the request the binding is gone.
    expect(requestLocale()).toBe("en");
  });

  it("keeps two requests running at once in their own languages", async () => {
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const said = await Promise.all([
      runWithLocale("fr", async () => {
        await wait(15);
        return tr("notAuthenticated");
      }),
      runWithLocale("de", async () => {
        await wait(5);
        return tr("notAuthenticated");
      }),
      runWithLocale("en", async () => {
        await wait(10);
        return tr("notAuthenticated");
      }),
    ]);
    expect(said).toEqual([
      "Non authentifié",
      "Nicht authentifiziert",
      "Not authenticated",
    ]);
  });

  it("words a message for someone else in THEIR language", () => {
    // An organiser reading French triggers a notice for a buyer who reads
    // Spanish: the buyer's words must not follow the organiser's request.
    const forBuyer = runWithLocale("fr", () => trFor("es")("notAuthenticated"));
    expect(forBuyer).toBe("No autenticado");
  });

  it("gives shared copy (core) in the requester's language", () => {
    const english = coreT()("notices.ticket_confirmed.title");
    const french = runWithLocale("fr", () =>
      coreT()("notices.ticket_confirmed.title"),
    );
    expect(english).toBe("Ticket confirmed");
    expect(french).toBe("Billet confirmé");
  });
});

describe("text the database or a shared schema wrote", () => {
  it("leaves English alone", () => {
    expect(translateServerText("en", "Not signed in")).toBe("Not signed in");
  });

  it("translates a fixed sentence a database function raised", () => {
    const text = "Not enough spots are left for this event.";
    const french = translateServerText("fr", text);
    expect(french).not.toBe(text);
    expect(french).toBe("Il ne reste pas assez de places pour cet événement.");
  });

  it("carries the values of a database message across", () => {
    expect(
      translateServerText(
        "fr",
        "Insufficient credit (available 5, requested 9)",
      ),
    ).toBe("Crédit insuffisant (disponible 5, demandé 9)");
  });

  it("translates a sentence a shared form schema wrote", () => {
    expect(translateServerText("fr", "Name is required.")).toBe(
      "Le nom est obligatoire.",
    );
    expect(translateServerText("fr", "Keep it under 500 characters")).toBe(
      "Ne dépassez pas 500 caractères",
    );
  });

  it("returns what it does not know as it came", () => {
    const unknown = "duplicate key value violates unique constraint";
    expect(translateServerText("fr", unknown)).toBe(unknown);
    expect(translateServerText("fr", null)).toBeNull();
    expect(translateServerText("fr", "")).toBe("");
  });

  it("says every database and schema sentence in each finished language", () => {
    // The generic failure every service can return must never reach a
    // French, Spanish, German or Portuguese reader in English.
    const generic = "Something went wrong. Please try again.";
    for (const locale of ["fr", "es", "de", "pt"]) {
      const said = translateServerText(locale, generic);
      expect(said, locale).toBeTruthy();
      expect(said, locale).not.toBe(generic);
    }
  });
});
