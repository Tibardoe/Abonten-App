import { describe, expect, it, vi } from "vitest";
import { cloudinary, uploadImageBuffer } from "./cloudinaryClient";

// Production gate (2026-09-25): the old flyer/photo uploads wrote each file
// to tmpdir/<the client's file name> and uploaded that path. 50 simultaneous
// uploads all named "image.jpg" published 4 people's pictures under someone
// else's listing and failed 46 (the file was already deleted) — reproduced
// with the old code path. The in-memory path has no shared state to race on.

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("uploadImageBuffer under simultaneous uploads", () => {
  it("uploads each caller's own bytes, 50 at once", async () => {
    const upload = vi
      .spyOn(cloudinary.uploader, "upload")
      .mockImplementation((async (file: string) => {
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        const bytes = Buffer.from(file.split(",")[1], "base64");
        return {
          public_id: bytes.subarray(PNG_HEADER.length).toString(),
          version: 1,
          width: 10,
          height: 10,
          secure_url: "https://res.cloudinary.test/x",
        };
      }) as never);

    const owners = Array.from({ length: 50 }, (_, i) => `owner-${i}`);
    const results = await Promise.all(
      owners.map((owner) =>
        uploadImageBuffer(Buffer.concat([PNG_HEADER, Buffer.from(owner)]), {
          folder: "event_flyers",
        }),
      ),
    );

    expect(results.map((r) => r.public_id)).toEqual(owners);
    expect(upload).toHaveBeenCalledTimes(50);
    for (const [file] of upload.mock.calls) {
      expect(String(file)).toMatch(/^data:image\/png;base64,/);
    }
    upload.mockRestore();
  });

  it("refuses bytes that are not an image it knows", async () => {
    await expect(
      uploadImageBuffer(Buffer.from("<svg onload=alert(1)>"), {
        folder: "event_flyers",
      }),
    ).rejects.toThrow(/Not a supported image/);
  });
});
