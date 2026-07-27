import { describe, it, expect, vi, beforeEach } from "vitest";
import { Transfer } from "../../src/transfer";
import { TransferState } from "../../src/state";
import * as viem from "viem";
import { AttestationClient } from "../../src/attestation";
import { getOrCreatePublicClient } from "../../src/utils/fee";

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof viem>("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(),
    keccak256: vi.fn().mockReturnValue("0xhash"),
    parseEventLogs: vi.fn(),
  };
});

vi.mock("../../src/utils/fee", async () => {
  const actual = await vi.importActual<any>("../../src/utils/fee");
  return {
    ...actual,
    getOrCreatePublicClient: vi.fn(),
  };
});

describe("Transfer state machine", () => {
  let mockPublicClient: any;
  let mockSourceWallet: any;
  let mockDestWallet: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue(0n),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        logs: [{
          address: "0x0000000000000000000000000000000000000000",
          data: "0xbytes"
        }]
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        logs: [{
          address: "0x0000000000000000000000000000000000000000",
          data: "0xbytes"
        }]
      }),
      getGasPrice: vi.fn().mockResolvedValue(1000000000n),
      estimateContractGas: vi.fn().mockResolvedValue(100000n),
    };

    vi.mocked(getOrCreatePublicClient).mockReturnValue(mockPublicClient);
    vi.mocked(viem.parseEventLogs).mockReturnValue([{ args: { message: "0xbytes" } }] as any);
    vi.mocked(viem.keccak256).mockReturnValue("0xhash" as any);

    mockSourceWallet = {
      account: { address: "0xsender" },
      chain: { id: 1 },
      writeContract: vi.fn().mockResolvedValue("0xsourcehash"),
    };

    mockDestWallet = {
      account: { address: "0xreceiver" },
      chain: { id: 42161 },
      writeContract: vi.fn().mockResolvedValue("0xdestasthash"),
    };

    vi.spyOn(AttestationClient.prototype, "poll").mockResolvedValue({
      attestation: "0xsignature",
      messageBytes: "0xbytes",
    } as any);
    vi.spyOn(AttestationClient.prototype, "getAttestation").mockResolvedValue({ status: "complete", attestation: "0xsignature" });
  });

  it("should successfully execute a full transfer lifecycle (burn and relay)", async () => {
    const params = {
      from: "ethereum" as const,
      to: "arbitrum" as const,
      amount: 1000000n, // $1
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 10,
      rpcs: {},
    };

    const transfer = new Transfer(params, mockSourceWallet, mockDestWallet, config as any);

    const states: TransferState[] = [];
    transfer.on("stateChange", (snap) => {
      states.push(snap.state);
    });

    await transfer.execute();

    expect(states).toContain(TransferState.APPROVING);
    expect(states).toContain(TransferState.APPROVED);
    expect(states).toContain(TransferState.BURNING);
    expect(states).toContain(TransferState.BURNED);
    expect(states).toContain(TransferState.AWAITING_ATTESTATION);
    expect(states).toContain(TransferState.ATTESTED);
    expect(states).toContain(TransferState.RELAYING);
    expect(states).toContain(TransferState.COMPLETE);

    expect(transfer.state).toBe(TransferState.COMPLETE);
  });

  it("should skip approval if allowance is sufficient", async () => {
    mockPublicClient.readContract = vi.fn().mockResolvedValue(100000000n); // allowance > amount

    const params = {
      from: "base" as const,
      to: "arbitrum" as const,
      amount: 1000000n,
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 10,
      rpcs: {},
    };

    const transfer = new Transfer(params, mockSourceWallet, mockDestWallet, config as any);

    const states: TransferState[] = [];
    transfer.on("stateChange", (snap) => {
      states.push(snap.state);
    });

    await transfer.execute();

    expect(states).not.toContain(TransferState.APPROVING);
    expect(states).toContain(TransferState.APPROVED);
    expect(states).toContain(TransferState.BURNING);
    expect(states).toContain(TransferState.COMPLETE);
  });

  it("should transition to FAILED if a step fails", async () => {
    mockSourceWallet.writeContract = vi.fn().mockRejectedValue(new Error("User rejected"));

    const params = {
      from: "optimism" as const,
      to: "arbitrum" as const,
      amount: 1000000n,
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 10,
      rpcs: {},
    };

    const transfer = new Transfer(params, mockSourceWallet, mockDestWallet, config as any);

    await expect(transfer.execute()).rejects.toThrow("User rejected");
    expect(transfer.state).toBe(TransferState.FAILED);
  });

  it("should support persistence and fromId resumability", async () => {
    const params = {
      from: "polygon" as const,
      to: "avalanche" as const,
      amount: 5000000n,
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 10,
      rpcs: {},
    };

    const transfer = new Transfer(params, mockSourceWallet, mockDestWallet, config as any);
    const transferId = transfer.transferId;

    // Reconstruct transfer using fromId
    const resumed = await Transfer.fromId(transferId, mockSourceWallet, mockDestWallet, config as any);
    expect(resumed.transferId).toBe(transferId);
    expect(resumed.state).toBe(TransferState.IDLE);
  });

  it("should burn with the executor as mintRecipient + destinationCaller and relay through it when a hook is present", async () => {
    const executor = ("0x" + "ab".repeat(20)) as `0x${string}`;
    const executorBytes32 = ("0x" + "0".repeat(24) + "ab".repeat(20)) as `0x${string}`;

    const params = {
      from: "base" as const,
      to: "arbitrum" as const,
      amount: 10000000n, // $10
      hook: {
        target: ("0x" + "cd".repeat(20)) as `0x${string}`,
        calldata: "0x1234" as `0x${string}`,
      },
      hookExecutor: executor,
      maxFee: 100n,
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 10,
      rpcs: {},
      hookExecutors: {},
    };

    const transfer = new Transfer(params, mockSourceWallet, mockDestWallet, config as any);
    await transfer.execute();

    // Burn: depositForBurnWithHook with executor as mintRecipient AND destinationCaller
    const burnCall = mockSourceWallet.writeContract.mock.calls
      .map((c: any[]) => c[0])
      .find((c: any) => c.functionName === "depositForBurnWithHook");
    expect(burnCall).toBeDefined();
    expect(burnCall.args[2]).toBe(executorBytes32); // mintRecipient
    expect(burnCall.args[4]).toBe(executorBytes32); // destinationCaller

    // Relay: relayAndExecute on the executor, not receiveMessage on the transmitter
    const relayCall = mockDestWallet.writeContract.mock.calls
      .map((c: any[]) => c[0])
      .find((c: any) => c.functionName === "relayAndExecute");
    expect(relayCall).toBeDefined();
    expect(relayCall.address).toBe(executor);
    expect(mockDestWallet.writeContract.mock.calls
      .map((c: any[]) => c[0])
      .find((c: any) => c.functionName === "receiveMessage")).toBeUndefined();

    expect(transfer.state).toBe(TransferState.COMPLETE);
  });

  it("should fail with HOOK_EXECUTOR_REQUIRED when a hook is set without an executor", async () => {
    const params = {
      from: "base" as const,
      to: "arbitrum" as const,
      amount: 10000000n,
      hook: {
        target: ("0x" + "cd".repeat(20)) as `0x${string}`,
        calldata: "0x1234" as `0x${string}`,
      },
      maxFee: 100n,
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 10,
      rpcs: {},
      hookExecutors: {},
    };

    const transfer = new Transfer(params, mockSourceWallet, mockDestWallet, config as any);

    await expect(transfer.execute()).rejects.toMatchObject({ code: "HOOK_EXECUTOR_REQUIRED" });
    expect(transfer.state).toBe(TransferState.FAILED);
  });

  it("should recover transfer status from transaction hash", async () => {
    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 10,
      rpcs: {},
    };

    const status = await Transfer.getStatusFromHash("0xburnhash", "ethereum", config as any);
    expect(status.state).toBe(TransferState.ATTESTED);
    expect(status.sourceTxHash).toBe("0xburnhash");
    expect(status.messageBytes).toBe("0xbytes");
    expect(status.attestation).toBe("0xsignature");
  });
});
