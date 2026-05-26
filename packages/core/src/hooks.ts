import { encodeAbiParameters, parseAbiParameters, encodeFunctionData, parseAbi } from "viem";
import type { TransferHook } from "./types";

/**
 * Build a hook that deposits minted USDC into a vault on the destination chain.
 */
export const Hooks = {
  /**
   * Forward minted USDC directly to a contract function call.
   * Encodes arbitrary calldata.
   */
  raw(target: `0x${string}`, calldata: `0x${string}`, forwardAmount?: bigint): TransferHook {
    return { target, calldata, forwardAmount };
  },

  /**
   * Deposit minted USDC into an ERC4626-compatible vault.
   */
  depositToVault(opts: {
    vaultAddress: `0x${string}`;
    receiver?: `0x${string}`;
    minSharesOut?: bigint;
  }): TransferHook {
    const calldata = encodeFunctionData({
      abi: parseAbi(["function deposit(uint256 assets, address receiver) returns (uint256)"]),
      functionName: "deposit",
      args: [0n /* amount injected at runtime by hook */, opts.receiver ?? "0x0000000000000000000000000000000000000000"],
    });
    return { target: opts.vaultAddress, calldata };
  },

  /**
   * Swap minted USDC on a Uniswap v3 pool immediately on destination.
   */
  swapOnUniswap(opts: {
    router: `0x${string}`;
    tokenOut: `0x${string}`;
    fee: number;
    amountOutMinimum: bigint;
    recipient: `0x${string}`;
    deadline?: number;
  }): TransferHook {
    const deadline = opts.deadline ?? Math.floor(Date.now() / 1000) + 1800;
    const calldata = encodeFunctionData({
      abi: parseAbi([
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256)"
      ]),
      functionName: "exactInputSingle",
      args: [{
        tokenIn: "0x0000000000000000000000000000000000000000", // USDC on destination — injected at runtime
        tokenOut: opts.tokenOut,
        fee: opts.fee,
        recipient: opts.recipient,
        deadline: BigInt(deadline),
        amountIn: 0n,           // injected at runtime
        amountOutMinimum: opts.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      }],
    });
    return { target: opts.router, calldata };
  },

  /**
   * Pay a contract for a service (agent-to-agent payment pattern).
   */
  payContract(opts: {
    target: `0x${string}`;
    functionSignature: string;
    args?: readonly unknown[];
  }): TransferHook {
    const calldata = encodeFunctionData({
      abi: parseAbi([opts.functionSignature]),
      functionName: opts.functionSignature.split("(")[0].replace("function ", "").trim(),
      args: opts.args ?? [],
    } as any);
    return { target: opts.target, calldata };
  },
};

export function encodeHook(hook: TransferHook): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters("address target, bytes calldata, uint256 forwardAmount"),
    [hook.target, hook.calldata, hook.forwardAmount ?? 0n]
  );
}
