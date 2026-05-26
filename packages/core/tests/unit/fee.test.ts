import { describe, it, expect, vi } from "vitest";
import { estimateFee } from "../../src/utils/fee";
import * as viem from "viem";

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof viem>("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

describe("fee estimation", () => {
  it("should estimate fee correctly for fast path", async () => {
    const mockEstimateContractGas = vi.fn().mockResolvedValue(100000n);
    const mockGetGasPrice = vi.fn().mockResolvedValue(2000000000n); // 2 gwei

    const mockPublicClient = {
      estimateContractGas: mockEstimateContractGas,
      getGasPrice: mockGetGasPrice,
    };

    (viem.createPublicClient as any).mockReturnValue(mockPublicClient);

    const params = {
      sourceChain: "ethereum" as const,
      destinationChain: "arbitrum" as const,
      amount: 100000000n, // 100 USDC
      fast: true,
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 1000,
      rpcs: {},
    };

    const res = await estimateFee(params, config);

    expect(res.isFast).toBe(true);
    expect(res.gasCostWei).toBe(200000000000000n); // 100000 * 2000000000
    expect(res.bridgeFeeUsdc).toBe(50000n); // 0.05% of 100 USDC = 0.05 USDC = 50000 base units (6 decimals)
    expect(res.estimatedSeconds).toBe(2);
  });

  it("should estimate fee correctly for slow path", async () => {
    const mockEstimateContractGas = vi.fn().mockResolvedValue(100000n);
    const mockGetGasPrice = vi.fn().mockResolvedValue(1000000000n); // 1 gwei

    const mockPublicClient = {
      estimateContractGas: mockEstimateContractGas,
      getGasPrice: mockGetGasPrice,
    };

    (viem.createPublicClient as any).mockReturnValue(mockPublicClient);

    const params = {
      sourceChain: "base" as const,
      destinationChain: "arbitrum" as const,
      amount: 100000000n,
      fast: false,
    };

    const config = {
      env: "testnet" as const,
      attestationApiUrl: "http://mock",
      maxAttestationAttempts: 10,
      pollIntervalMs: 1000,
      rpcs: {},
    };

    const res = await estimateFee(params, config);

    expect(res.isFast).toBe(false);
    expect(res.gasCostWei).toBe(100000000000000n); // 100000 * 1000000000
    expect(res.bridgeFeeUsdc).toBe(0n);
    expect(res.estimatedSeconds).toBe(20);
  });
});
