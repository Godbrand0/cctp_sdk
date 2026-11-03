"use client";
import { useState } from "react";
import { mainnet, testnet } from "../lib/content";

export function Chains() {
  const [env, setEnv] = useState<"mainnet" | "testnet">("mainnet");
  const [q, setQ] = useState("");
  const rows = (env === "mainnet" ? mainnet : testnet).filter((r) =>
    r.join(" ").toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div>
      <div className="chain-controls">
        <div role="tablist" aria-label="Network" className="seg">
          {(["mainnet", "testnet"] as const).map((e) => (
            <button key={e} role="tab" aria-selected={env === e} onClick={() => setEnv(e)}>{e}</button>
          ))}
        </div>
        <label className="search">
          <span className="sr">Filter chains</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, id or domain" />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Key</th><th>Chain</th><th>Chain ID</th><th>CCTP domain</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <td><code>{r[0]}</code></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="muted">No chain matches “{q}”. Try a chain name or a domain number.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
