import { AttestationApiError, AttestationTimeoutError } from "./errors";

export type AttestationStatus = "pending_confirmations" | "complete";

export type AttestationResponse = {
  status: AttestationStatus;
  attestation: `0x${string}` | null;
};

// basic sleep util
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AttestationClient {
  constructor(private baseUrl: string) {}

  async getAttestation(messageHash: `0x${string}`): Promise<AttestationResponse> {
    const url = `${this.baseUrl}/v1/attestations/${messageHash}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new AttestationApiError(res.status, await res.text());
    }

    return res.json() as Promise<AttestationResponse>;
  }

  /**
   * Poll until attestation is complete with exponential backoff.
   * Default: starts at 2s, doubles each attempt, caps at 30s.
   */
  async poll(
    messageHash: `0x${string}`,
    opts: {
      maxAttempts: number;
      intervalMs: number;       // 0 = use exponential backoff
      onAttempt?: (attempt: number, status: AttestationStatus) => void;
    }
  ): Promise<`0x${string}`> {
    let attempt = 0;

    while (attempt < opts.maxAttempts) {
      const { status, attestation } = await this.getAttestation(messageHash);
      opts.onAttempt?.(attempt, status);

      if (status === "complete" && attestation) {
        return attestation;
      }

      const delay = opts.intervalMs > 0
        ? opts.intervalMs
        : Math.min(2000 * Math.pow(1.5, attempt), 30_000);

      await sleep(delay);
      attempt++;
    }

    throw new AttestationTimeoutError(messageHash, opts.maxAttempts);
  }
}
