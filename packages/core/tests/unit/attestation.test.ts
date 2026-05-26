import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttestationClient } from "../../src/attestation";
import { AttestationApiError, AttestationTimeoutError } from "../../src/errors";

describe("AttestationClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return the attestation if complete", async () => {
    const mockResponse = { status: "complete", attestation: "0x1234" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new AttestationClient("https://attestation.mock.circle.com");
    const res = await client.getAttestation("0xhash");
    expect(res).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith("https://attestation.mock.circle.com/v1/attestations/0xhash");
  });

  it("should throw an AttestationApiError on non-200 responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not Found"),
    });

    const client = new AttestationClient("https://attestation.mock.circle.com");
    await expect(client.getAttestation("0xhash")).rejects.toThrow(AttestationApiError);
  });

  it("should poll with success on the second attempt", async () => {
    const mockPending = { status: "pending_confirmations", attestation: null };
    const mockComplete = { status: "complete", attestation: "0xsignature" };

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(fetchCount === 1 ? mockPending : mockComplete),
      });
    });

    const client = new AttestationClient("https://attestation.mock.circle.com");
    const onAttempt = vi.fn();

    const signature = await client.poll("0xhash", {
      maxAttempts: 3,
      intervalMs: 1, // fast testing
      onAttempt,
    });

    expect(signature).toBe("0xsignature");
    expect(fetchCount).toBe(2);
    expect(onAttempt).toHaveBeenCalledTimes(2);
  });

  it("should throw timeout after reaching max attempts", async () => {
    const mockPending = { status: "pending_confirmations", attestation: null };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPending),
    });

    const client = new AttestationClient("https://attestation.mock.circle.com");
    await expect(
      client.poll("0xhash", {
        maxAttempts: 2,
        intervalMs: 1,
      })
    ).rejects.toThrow(AttestationTimeoutError);
  });
});
