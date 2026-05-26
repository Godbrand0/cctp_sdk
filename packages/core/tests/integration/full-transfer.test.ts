import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { CctpClient } from "../../src/client";
import { TransferState } from "../../src/state";
import { startMockAttestor } from "../../../hardhat-plugin/src/mock-attestor";
import * as viem from "viem";
import { getOrCreatePublicClient } from "../../src/utils/fee";
import { AttestationClient } from "../../src/attestation";

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

describe("E2E Integration - CCTP Transfer", () => {
  let stopAttestor: () => void;
  let mockPublicClient: any;
  let mockSourceWallet: any;
  let mockDestWallet: any;

  beforeAll(async () => {
    // Start the local mock attestation server on port 3005
    stopAttestor = await startMockAttestor(3005);

    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue(1000000000n), // approved
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
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

    const randAddress = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}` as `0x${string}`;
    mockSourceWallet = {
      account: { address: randAddress },
      chain: { id: 1 },
      writeContract: vi.fn().mockResolvedValue("0xsourcehash"),
    };

    mockDestWallet = {
      account: { address: "0xreceiver" },
      chain: { id: 42161 },
      writeContract: vi.fn().mockResolvedValue("0xdestasthash"),
    };
  });

  afterAll(() => {
    if (stopAttestor) stopAttestor();
  });

  it("should complete a full end-to-end transfer using mock attestor API", async () => {
    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://localhost:3005",
      maxAttestationAttempts: 5,
      pollIntervalMs: 50,
      rpcs: {},
    };

    const client = new CctpClient(config);
    
    const params = {
      sourceChain: "ethereum" as const,
      destinationChain: "arbitrum" as const,
      amount: 25000000n, // $25 USDC
    };

    // Create Transfer instance directly so we can attach listener before execution
    const transfer = new (await import("../../src/transfer")).Transfer(
      params,
      mockSourceWallet,
      mockDestWallet,
      (client as any).config
    );

    const states: TransferState[] = [];
    transfer.on("stateChange", (snap) => {
      states.push(snap.state);
    });

    await transfer.execute();

    expect(states).toContain(TransferState.BURNING);
    expect(states).toContain(TransferState.AWAITING_ATTESTATION);
    expect(states).toContain(TransferState.COMPLETE);
    expect(transfer.state).toBe(TransferState.COMPLETE);
  });
});
