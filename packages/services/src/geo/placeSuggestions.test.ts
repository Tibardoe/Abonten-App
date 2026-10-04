import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlaceCore, suggestPlacesCore } from "./placeSuggestions";

vi.mock("../markets/marketConfig", () => ({
  listPublicMarkets: async () => [{ countryCode: "GH" }, { countryCode: "NG" }],
}));

type Sent = {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
};

function stubGoogle(reply: () => Response): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return reply();
    },
  );
  return sent;
}

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const SESSION = "lz1a2b3c-k9x8y7w6v5";

// Assigning undefined would store the string "undefined" in process.env.
function unsetEnv(name: string) {
  delete process.env[name];
}

beforeEach(() => {
  process.env.GOOGLE_MAPS_API_KEY = "server-key-for-tests";
});

afterEach(() => {
  unsetEnv("GOOGLE_MAPS_API_KEY");
  unsetEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  vi.unstubAllGlobals();
});

describe("suggestPlacesCore", () => {
  it("asks Places (New) in the open markets, near the area, in the reader's language", async () => {
    const sent = stubGoogle(
      json(200, {
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJosu",
              text: { text: "Osu, Accra, Ghana" },
              structuredFormat: {
                mainText: { text: "Osu" },
                secondaryText: { text: "Accra, Ghana" },
              },
            },
          },
          { queryPrediction: { text: { text: "osu restaurants" } } },
        ],
      }),
    );

    const res = await suggestPlacesCore({
      q: " Osu ",
      session: SESSION,
      lat: 5.56,
      lng: -0.18,
      locale: "fr",
    });

    expect(res).toEqual({
      status: 200,
      data: [{ placeId: "ChIJosu", primary: "Osu", secondary: "Accra, Ghana" }],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(
      "https://places.googleapis.com/v1/places:autocomplete",
    );
    expect(sent[0].method).toBe("POST");
    expect(sent[0].headers.get("X-Goog-Api-Key")).toBe("server-key-for-tests");
    expect(sent[0].headers.get("X-Goog-FieldMask")).toContain(
      "suggestions.placePrediction.placeId",
    );
    expect(sent[0].body).toEqual({
      input: "Osu",
      sessionToken: SESSION,
      languageCode: "fr",
      includedRegionCodes: ["gh", "ng"],
      locationBias: {
        circle: {
          center: { latitude: 5.56, longitude: -0.18 },
          radius: 50_000,
        },
      },
    });
  });

  it("does not call Google for fewer than three characters", async () => {
    const sent = stubGoogle(json(200, {}));
    const res = await suggestPlacesCore({
      q: "Os",
      session: SESSION,
      locale: "en",
    });
    expect(res).toEqual({ status: 200, data: [] });
    expect(sent).toHaveLength(0);
  });

  it("answers 503, not an empty list, when Google refuses", async () => {
    stubGoogle(json(403, { error: { status: "PERMISSION_DENIED" } }));
    const res = await suggestPlacesCore({
      q: "Kumasi",
      session: SESSION,
      locale: "en",
    });
    expect(res.status).toBe(503);
    expect(res.data).toBeUndefined();
  });

  it("answers 503 when no key is configured", async () => {
    unsetEnv("GOOGLE_MAPS_API_KEY");
    const sent = stubGoogle(json(200, {}));
    const res = await suggestPlacesCore({
      q: "Kumasi",
      session: SESSION,
      locale: "en",
    });
    expect(res.status).toBe(503);
    expect(sent).toHaveLength(0);
  });
});

describe("resolvePlaceCore", () => {
  it("asks for the location and address only, ending the session", async () => {
    const sent = stubGoogle(
      json(200, {
        location: { latitude: 5.556, longitude: -0.1969 },
        formattedAddress: "Osu, Accra, Ghana",
      }),
    );
    const res = await resolvePlaceCore({
      placeId: "ChIJosu",
      session: SESSION,
      locale: "pt",
    });
    expect(res).toEqual({
      status: 200,
      data: { lat: 5.556, lng: -0.1969, address: "Osu, Accra, Ghana" },
    });
    expect(sent[0].url).toBe(
      `https://places.googleapis.com/v1/places/ChIJosu?sessionToken=${SESSION}&languageCode=pt-PT`,
    );
    expect(sent[0].headers.get("X-Goog-FieldMask")).toBe(
      "location,formattedAddress",
    );
  });

  it("is 404 for a place Google does not know", async () => {
    stubGoogle(json(404, { error: { status: "NOT_FOUND" } }));
    const res = await resolvePlaceCore({
      placeId: "ChIJgone",
      session: SESSION,
      locale: "en",
    });
    expect(res.status).toBe(404);
  });

  it("is 503 when Google cannot be reached", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const res = await resolvePlaceCore({
      placeId: "ChIJosu",
      session: SESSION,
      locale: "en",
    });
    expect(res.status).toBe(503);
  });
});
