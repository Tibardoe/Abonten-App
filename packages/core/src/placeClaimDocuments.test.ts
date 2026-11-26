import { describe, expect, it } from "vitest";
import {
  CLAIM_DOC_MAX_BYTES,
  claimDocExtension,
  claimDocPath,
  claimDocProblem,
  guessClaimDocMime,
} from "./placeClaimDocuments";

describe("claimDocProblem", () => {
  it("accepts photos and PDFs within the bucket's limit", () => {
    expect(
      claimDocProblem({ mimeType: "application/pdf", sizeBytes: 1024 }),
    ).toBeNull();
    expect(
      claimDocProblem({ mimeType: "image/heic", sizeBytes: null }),
    ).toBeNull();
  });

  it("refuses other types and files over the limit", () => {
    expect(claimDocProblem({ mimeType: "image/gif", sizeBytes: 10 })).toBe(
      "type",
    );
    expect(
      claimDocProblem({
        mimeType: "image/png",
        sizeBytes: CLAIM_DOC_MAX_BYTES + 1,
      }),
    ).toBe("size");
  });
});

describe("guessClaimDocMime", () => {
  it("prefers the picker's type", () => {
    expect(guessClaimDocMime("file:///a", "a", "image/png", "image/jpeg")).toBe(
      "image/png",
    );
  });

  it("falls back to the extension, then to the caller's default", () => {
    expect(
      guessClaimDocMime(
        "file:///scan.PDF?x=1",
        undefined,
        "application/octet-stream",
        "image/jpeg",
      ),
    ).toBe("application/pdf");
    expect(guessClaimDocMime("file:///x.tiff", "x.tiff", undefined, "z")).toBe(
      "z",
    );
  });
});

describe("claimDocExtension and claimDocPath", () => {
  it("keeps the file's own extension, else derives one", () => {
    expect(claimDocExtension("image/jpeg", "Lease.JPEG")).toBe("jpeg");
    expect(claimDocExtension("application/pdf", "lease")).toBe("pdf");
    expect(claimDocExtension("text/plain", "notes")).toBe("bin");
  });

  it("stores under the claimant's folder first", () => {
    expect(claimDocPath("u", "c", "f", "pdf")).toBe("u/c/f.pdf");
  });
});
