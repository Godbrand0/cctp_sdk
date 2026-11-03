"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { testnet, states } from "../lib/content";
import { CopyButton } from "./CopyButton";

const evm = testnet;
const phaseOf = (s: string) =>
  ["APPROVING", "APPROVED", "BURNING", "BURNED"].includes(s) ? "burn"
  : ["AWAITING_ATTESTATION", "ATTESTED"].includes(s) ? "attest"
  : ["RELAYING", "COMPLETE"].includes(s) ? "mint" : "idle";

function fakeHash(seed: string) {
  let h = 2166136261;
  let out = "0x";
  for (let i = 0; out.length < 66; i++) {
    h ^= (seed.charCodeAt(i % seed.length) + i) | 0;
    h = Math.imul(h, 16777619);
    out += ((h >>> 0) & 0xffff).toString(16).padStart(4, "0");
  }
  return out.slice(0, 66);
}

export function Simulator() {
  const [from, setFrom] = useState("base");
  const [to, setTo] = useState("arbitrum");
  const [amount, setAmount] = useState("10");
  const [fast, setFast] = useState(true);
  const [idx, setIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const state = states[idx];
  const last = states.length - 1;
  const fromC = evm.find((c) => c[0] === from)!;
  const toC = evm.find((c) => c[0] === to)!;
  const seed = `${from}${to}${amount}${fast}`;

  useEffect(() => {
    if (!running) return;
    if (idx >= last) { setRunning(false); return; }
    const next = states[idx + 1];
    const delay = next === "AWAITING_ATTESTATION" ? 700 : next === "ATTESTED" ? (fast ? 1600 : 4200) : next === "COMPLETE" ? 1200 : 800;
    timer.current = setTimeout(() => setIdx(idx + 1), delay);
    return () => clearTimeout(timer.current);
  }, [running, idx, last, fast]);

  const reset = () => { clearTimeout(timer.current); setRunning(false); setIdx(0); };
  const run = () => { setIdx(1); setRunning(true); };
  const changed = <T,>(set: (v: T) => void) => (v: T) => { set(v); reset(); };

  const snapshot = useMemo(() => {
    const s: Record<string, unknown> = { state, transferId: "tr_" + fakeHash(seed).slice(2, 14) };
    if (idx >= states.indexOf("BURNED")) s.sourceTxHash = fakeHash(seed + "src");
    if (idx >= states.indexOf("ATTESTED")) {
      s.messageBytes = fakeHash(seed + "msg").slice(0, 24) + "…";
      s.attestation = fakeHash(seed + "att").slice(0, 24) + "…";
    }
    if (idx >= last) s.destinationTxHash = fakeHash(seed + "dst");
    return JSON.stringify(s, null, 2);
  }, [state, idx, seed, last]);

  const code = `const transfer = await client.transfer(
  { from: "${from}", to: "${to}", amount: parseUnits("${Number(amount) > 0 ? amount : "0"}", 6)${fast ? ", fast: true" : ""} },
  wallet
);`;

  const phase = phaseOf(state);
  const progress = (idx / last) * 100;

  return (
    <section className="sim" aria-label="Transfer simulator">
      <div className="sim-controls">
        <label>From
          <select value={from} onChange={(e) => changed(setFrom)(e.target.value)}>
            {evm.map((c) => <option key={c[0]} value={c[0]} disabled={c[0] === to}>{c[1]}</option>)}
          </select>
        </label>
        <label>To
          <select value={to} onChange={(e) => changed(setTo)(e.target.value)}>
            {evm.map((c) => <option key={c[0]} value={c[0]} disabled={c[0] === from}>{c[1]}</option>)}
          </select>
        </label>
        <label>USDC
          <input inputMode="decimal" value={amount} onChange={(e) => changed(setAmount)(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={fast} onChange={(e) => changed(setFast)(e.target.checked)} />
          Fast lane
        </label>
        <button className="btn" onClick={idx === last ? reset : run} disabled={running || !(Number(amount) > 0)}>
          {running ? "Running…" : idx === last ? "Run again" : "Run transfer"}
        </button>
      </div>

      <div className="route" data-phase={phase}>
        <div className="node node-src"><span className="node-label">Burn on</span><strong>{fromC[1]}</strong><small>domain {fromC[3]}</small></div>
        <div className="track" aria-hidden="true">
          <div className="fill" style={{ width: `${progress}%` }} />
          <div className="packet" style={{ left: `${progress}%` }} />
          <span className="track-label">{phase === "attest" ? "Circle signs the message" : phase === "idle" ? "Ready" : phase === "burn" ? "USDC burned at source" : "USDC minted at destination"}</span>
        </div>
        <div className="node node-dst"><span className="node-label">Mint on</span><strong>{toC[1]}</strong><small>domain {toC[3]}</small></div>
      </div>

      <div className="sim-body">
        <ol className="timeline" aria-live="polite">
          {states.slice(1).map((s, i) => {
            const n = i + 1;
            const status = n < idx ? "done" : n === idx ? (idx === last ? "done" : "active") : "todo";
            return (
              <li key={s} data-status={status} data-phase={phaseOf(s)}>
                <span className="dot" />
                <code>{s}</code>
              </li>
            );
          })}
        </ol>
        <div className="sim-out">
          <div className="out-head"><span>stateChange snapshot</span></div>
          <pre><code>{snapshot}</code></pre>
          <div className="out-head"><span>Your code</span><CopyButton text={code} /></div>
          <pre><code>{code}</code></pre>
        </div>
      </div>
      <p className="sim-note">
        Simulated in your browser. No wallet, network or Circle API is touched, and hashes are made up.
        {fast ? " Fast lane attests in seconds." : " Standard transfers wait for source-chain finality, which takes minutes on a real network."}
      </p>
    </section>
  );
}
