/**
 * MockAttestor replaces Circle's Attestation API in local tests.
 * Spins up an Express server that auto-signs any message hash immediately.
 * Set CCTP_ATTESTATION_URL=http://localhost:3001 in your test env.
 */
import express from "express";

export async function startMockAttestor(port = 3001): Promise<() => void> {
  const app = express();
  const signedMessages = new Map<string, string>();

  // Simulate a signed attestation for any messageHash
  app.get("/v1/attestations/:messageHash", (req, res) => {
    const { messageHash } = req.params;
    if (!signedMessages.has(messageHash)) {
      // Auto-generate a mock attestation signature
      const mockAttestation = "0x" + "ab".repeat(65); // 65-byte fake sig
      signedMessages.set(messageHash, mockAttestation);
    }
    res.json({ status: "complete", attestation: signedMessages.get(messageHash) });
  });

  const server = app.listen(port);
  return () => server.close();
}
