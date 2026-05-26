import { useState, useCallback } from "react";
import { type TransferParams, TransferState } from "@arc/cctp-sdk";
import { useCctpClient } from "../provider";
import type { WalletClient } from "viem";

export type UseTransferReturn = {
  transfer: (params: TransferParams, wallet: WalletClient, destWallet?: WalletClient) => Promise<void>;
  state: TransferState;
  sourceTxHash: `0x${string}` | undefined;
  destinationTxHash: `0x${string}` | undefined;
  error: Error | undefined;
  isLoading: boolean;
  reset: () => void;
};

export function useTransfer(): UseTransferReturn {
  const client = useCctpClient();
  const [state, setState] = useState<TransferState>(TransferState.IDLE);
  const [sourceTxHash, setSourceTxHash] = useState<`0x${string}` | undefined>();
  const [destinationTxHash, setDestinationTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<Error | undefined>();

  const transfer = useCallback(async (
    params: TransferParams,
    wallet: WalletClient,
    destWallet?: WalletClient
  ) => {
    setError(undefined);
    try {
      const t = await client.transfer(params, wallet, destWallet);

      t.on("stateChange", (snapshot) => {
        setState(snapshot.state);
        if (snapshot.sourceTxHash) setSourceTxHash(snapshot.sourceTxHash);
        if (snapshot.destinationTxHash) setDestinationTxHash(snapshot.destinationTxHash);
      });

      await t.wait();
    } catch (err) {
      setError(err as Error);
    }
  }, [client]);

  const reset = useCallback(() => {
    setState(TransferState.IDLE);
    setSourceTxHash(undefined);
    setDestinationTxHash(undefined);
    setError(undefined);
  }, []);

  return {
    transfer,
    state,
    sourceTxHash,
    destinationTxHash,
    error,
    isLoading: ![TransferState.IDLE, TransferState.COMPLETE, TransferState.FAILED].includes(state),
    reset,
  };
}
