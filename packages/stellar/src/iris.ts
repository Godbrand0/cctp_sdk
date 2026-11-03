export interface AttestationResult {
  attestation: `0x${string}`;
  /** Iris-provided message bytes (nonce populated); use these, not event-log bytes. */
  messageBytes: `0x${string}`;
}

export interface PollOptions {
  maxAttempts: number;
  intervalMs: number;
}

/**
 * Anything that can turn a burn transaction into an attested message.
 * `AttestationClient` from `@cctp-sdk/core` satisfies this structurally.
 */
export interface AttestationSource {
  poll(burnTxHash: `0x${string}`, sourceDomain: number, opts: PollOptions): Promise<AttestationResult>;
}

export const IRIS_SANDBOX = "https://iris-api-sandbox.circle.com";
export const IRIS_MAINNET = "https://iris-api.circle.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal Iris V2 poller for integrators who don't use `@cctp-sdk/core`. */
export class IrisClient implements AttestationSource {
  constructor(private baseUrl: string = IRIS_MAINNET) {}

  async poll(burnTxHash: `0x${string}`, sourceDomain: number, opts: PollOptions): Promise<AttestationResult> {
    const url = `${this.baseUrl}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
    for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const msg = (await res.json()).messages?.[0];
          if (msg?.status === "complete" && msg.attestation && msg.attestation !== "PENDING" && msg.message) {
            return { attestation: msg.attestation, messageBytes: msg.message };
          }
        } else if (res.status !== 404 && res.status !== 429) {
          throw new Error(`Iris returned ${res.status}: ${await res.text()}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Iris returned")) throw err;
        // network error: retry
      }
      await sleep(opts.intervalMs);
    }
    throw new Error(`attestation for ${burnTxHash} not ready after ${opts.maxAttempts} attempts`);
  }
}
