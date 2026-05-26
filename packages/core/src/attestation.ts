import { AttestationApiError, AttestationTimeoutError } from "./errors";

export type AttestationStatus = "pending_confirmations" | "complete";

export type AttestationResult = {
  attestation: `0x${string}`;
  messageBytes: `0x${string}`; // Iris-provided bytes (nonce populated); use instead of event log bytes
};

export type FeeEntry = {
  finalityThreshold: number;
  minimumFee: number; // in USDC decimal units (e.g. 1.3 = $1.30)
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AttestationClient {
  constructor(private baseUrl: string) {}

  async getMinimumFee(sourceDomain: number, destDomain: number): Promise<bigint> {
    const url = `${this.baseUrl}/v2/burn/USDC/fees/${sourceDomain}/${destDomain}`;
    const res = await fetch(url);
    if (!res.ok) return 0n;
    const entries: FeeEntry[] = await res.json();
    const fast = entries.sort((a, b) => a.finalityThreshold - b.finalityThreshold)[0];
    if (!fast || fast.minimumFee === 0) return 0n;
    return BigInt(Math.ceil(fast.minimumFee * 1_000_000));
  }

  async getAttestation(messageHash: `0x${string}`): Promise<{ status: string; attestation?: `0x${string}` }> {
    const url = `${this.baseUrl}/v1/attestations/${messageHash}`;
    const res = await fetch(url);
    if (!res.ok) return { status: "pending" };
    const data = await res.json();
    return {
      status: data.status ?? "pending",
      attestation: data.attestation !== "PENDING" ? data.attestation : undefined,
    };
  }

  // CCTP v2 attestation API: poll by burn tx hash and source domain
  async poll(
    burnTxHash: `0x${string}`,
    sourceDomain: number,
    opts: {
      maxAttempts: number;
      intervalMs: number;
      onAttempt?: (attempt: number) => void;
    }
  ): Promise<AttestationResult> {
    const url = `${this.baseUrl}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
    let attempt = 0;

    while (attempt < opts.maxAttempts) {
      opts.onAttempt?.(attempt);

      try {
        const res = await fetch(url);

        if (res.status === 404 || res.status === 429) {
          // 404 = not yet observed, 429 = rate limited — both mean wait and retry
          const delay = res.status === 429 ? 300_000 : (
            opts.intervalMs > 0 ? opts.intervalMs : Math.min(5000 * Math.pow(1.3, attempt), 30_000)
          );
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!res.ok) {
          throw new AttestationApiError(res.status, await res.text());
        }

        const data = await res.json();
        const msg = data.messages?.[0];

        if (msg?.status === "complete" && msg.attestation && msg.attestation !== "PENDING") {
          return {
            attestation: msg.attestation as `0x${string}`,
            // Use Iris message bytes — raw event log bytes have a zero nonce in CCTP v2
            messageBytes: (msg.message ?? null) as `0x${string}`,
          };
        }
      } catch (err: any) {
        if (err instanceof AttestationApiError) throw err;
        // network error — retry
      }

      const delay = opts.intervalMs > 0 ? opts.intervalMs : Math.min(5000 * Math.pow(1.3, attempt), 30_000);
      await sleep(delay);
      attempt++;
    }

    throw new AttestationTimeoutError(burnTxHash, opts.maxAttempts);
  }
}
