import { describe, it, expect } from "vitest";
import { Hooks, encodeHook } from "../../src/hooks";
import { decodeAbiParameters, parseAbiParameters } from "viem";

describe("hook builders", () => {
  it("should create raw hooks", () => {
    const hook = Hooks.raw("0x1111111111111111111111111111111111111111", "0xabcdef", 1000n);
    expect(hook.target).toBe("0x1111111111111111111111111111111111111111");
    expect(hook.calldata).toBe("0xabcdef");
    expect(hook.forwardAmount).toBe(1000n);
  });

  it("should create depositToVault hooks", () => {
    const hook = Hooks.depositToVault({
      vaultAddress: "0x2222222222222222222222222222222222222222",
      receiver: "0x3333333333333333333333333333333333333333",
    });
    expect(hook.target).toBe("0x2222222222222222222222222222222222222222");
    expect(hook.calldata).toBeDefined();
    expect(hook.calldata.startsWith("0x")).toBe(true);
  });

  it("should create swapOnUniswap hooks", () => {
    const hook = Hooks.swapOnUniswap({
      router: "0x4444444444444444444444444444444444444444",
      tokenOut: "0x5555555555555555555555555555555555555555",
      fee: 3000,
      amountOutMinimum: 500n,
      recipient: "0x6666666666666666666666666666666666666666",
    });
    expect(hook.target).toBe("0x4444444444444444444444444444444444444444");
    expect(hook.calldata.startsWith("0x")).toBe(true);
  });

  it("should create payContract hooks", () => {
    const hook = Hooks.payContract({
      target: "0x7777777777777777777777777777777777777777",
      functionSignature: "function verifyProof(bytes32 root, bytes32[] proof)",
      args: ["0x" + "0".repeat(64), []],
    });
    expect(hook.target).toBe("0x7777777777777777777777777777777777777777");
    expect(hook.calldata.startsWith("0x")).toBe(true);
  });

  it("should correctly encode hooks using abi parameters", () => {
    const hook = {
      target: "0x1111111111111111111111111111111111111111" as `0x${string}`,
      calldata: "0xabcdef" as `0x${string}`,
      forwardAmount: 12345n,
    };
    const encoded = encodeHook(hook);
    expect(encoded.startsWith("0x")).toBe(true);

    const decoded = decodeAbiParameters(
      parseAbiParameters("address target, bytes calldata, uint256 forwardAmount"),
      encoded
    );
    expect(decoded[0]).toBe(hook.target);
    expect(decoded[1]).toBe(hook.calldata);
    expect(decoded[2]).toBe(hook.forwardAmount);
  });
});
