import { useState, useEffect } from "react";
import { type FeeEstimate, type TransferParams } from "@cctp-sdk/core";
import { useCctpClient } from "../provider";

export function useEstimateFee(
  params: Pick<TransferParams, "from" | "to" | "amount" | "fast"> | null
) {
  const client = useCctpClient();
  const [estimate, setEstimate] = useState<FeeEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!params || !params.amount) return;
    setLoading(true);
    client.estimateFee(params).then(setEstimate).finally(() => setLoading(false));
  }, [client, params?.from, params?.to, params?.amount?.toString(), params?.fast]);

  return { estimate, loading };
}
