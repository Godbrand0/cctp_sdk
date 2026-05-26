/**
 * Testnet example: Transfer USDC from Base Sepolia → Arc testnet
 *
 * Prerequisites:
 *   1. Get Base Sepolia ETH (gas): https://www.alchemy.com/faucets/base-sepolia
 *   2. Get testnet USDC:           https://faucet.circle.com  (select "Base Sepolia")
 *
 * Usage:
 *   cp .env.example .env         # fill in your private key + optional RPC
 *   pnpm example:transfer
 */

import { createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { CctpClient } from "../packages/core/src/client";
import { TransferState } from "../packages/core/src/state";
import { TESTNET_CHAINS } from "../packages/core/src/chains";

const STATE_LABELS: Record<TransferState, string> = {
  [TransferState.IDLE]:                 "Idle",
  [TransferState.APPROVING]:            "Approving USDC spend...",
  [TransferState.APPROVED]:             "USDC approved",
  [TransferState.BURNING]:              "Submitting burn tx on Base Sepolia...",
  [TransferState.BURNED]:               "Burn confirmed — waiting for Circle attestation...",
  [TransferState.AWAITING_ATTESTATION]: "Polling Circle attestation API...",
  [TransferState.ATTESTED]:             "Attestation received — relaying on Arc...",
  [TransferState.RELAYING]:             "Submitting relay tx on Arc...",
  [TransferState.COMPLETE]:             "Transfer complete!",
  [TransferState.FAILED]:               "Transfer failed",
};

async function main() {
  const PRIVATE_KEY      = process.env.PRIVATE_KEY as `0x${string}`;
  const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
  const ARC_RPC          = process.env.ARC_RPC          ?? TESTNET_CHAINS.arc.rpcUrl ?? "https://rpc.testnet.arc.network";
  const AMOUNT_USDC      = process.env.AMOUNT_USDC      ?? "1";

  if (!PRIVATE_KEY || PRIVATE_KEY === "0x") {
    console.error("Missing PRIVATE_KEY in .env");
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);

  const arcTestnet = {
    id: TESTNET_CHAINS.arc.chainId,
    name: TESTNET_CHAINS.arc.name,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [ARC_RPC] } },
  };

  const sourceWallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(BASE_SEPOLIA_RPC),
  });

  const destWallet = createWalletClient({
    account,
    chain: arcTestnet as any,
    transport: http(ARC_RPC),
  });

  const client = new CctpClient({
    env: "testnet",
    chains: ["base", "arc"],
    attestationApiUrl: "https://iris-api-sandbox.circle.com",
    pollIntervalMs: 0,
    maxAttestationAttempts: 60,
    rpcs: {
      base: BASE_SEPOLIA_RPC,
      arc: ARC_RPC,
    },
  });

  const amount = parseUnits(AMOUNT_USDC, TESTNET_CHAINS.base.usdcDecimals);

  console.log(`\nTransferring ${AMOUNT_USDC} USDC`);
  console.log(`  From: Base Sepolia  (${account.address})`);
  console.log(`  To:   Arc Testnet   (${account.address})`);
  console.log(`  Amount (raw): ${amount.toString()}\n`);

  const transfer = await client.transfer(
    {
      from: "base",
      to: "arc",
      amount,
      fast: true,
    },
    sourceWallet,
    destWallet
  );

  transfer.on("stateChange", (snap) => {
    const label = STATE_LABELS[snap.state] ?? snap.state;
    const ts = new Date(snap.updatedAt).toISOString().slice(11, 19);
    console.log(`[${ts}] ${label}`);
    if (snap.sourceTxHash)      console.log(`          Source tx:  ${TESTNET_CHAINS.base.blockExplorer}/tx/${snap.sourceTxHash}`);
    if (snap.destinationTxHash) console.log(`          Dest tx:    ${TESTNET_CHAINS.arc.blockExplorer}/tx/${snap.destinationTxHash}`);
  });

  const result = await transfer.wait();
  console.log(`\nDone! Transfer ID: ${result.transferId}`);
  console.log(`Dest tx: ${TESTNET_CHAINS.arc.blockExplorer}/tx/${result.destinationTxHash}`);
}

main().catch((err) => {
  console.error("\nTransfer failed:", err.message ?? err);
  process.exit(1);
});
