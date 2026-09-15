import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./webPushCore";

// The sender POSTs to whatever endpoint is stored, so only real browser push
// services may be stored.
describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB",
    "https://fcm.googleapis.com:443/fcm/send/abc",
  ])("accepts %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.attacker.example/fcm/send/abc",
    "https://attacker.example/?host=fcm.googleapis.com",
    "https://evilpush.apple.com.example/x",
    "https://user:pass@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://169.254.169.254/latest/meta-data",
    "not a url",
    "",
  ])("rejects %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
