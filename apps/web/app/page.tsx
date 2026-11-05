import { Code } from "../components/Code";
import { Table } from "../components/Table";
import { Install } from "../components/Install";
import { Toc } from "../components/Toc";
import { Chains } from "../components/Chains";
import { Simulator } from "../components/Simulator";
import { HookDataDiagram } from "../components/HookDataDiagram";
import {
  manualSteps, packages, params,
  quickStart, resumeCode, hookCode, feeCode, reactCode, stellarCode,
} from "../lib/content";

const toc: [string, string][] = [
  ["why", "Why it exists"],
  ["options", "Transfer options"],
  ["features", "What it handles"],
  ["stellar", "Stellar"],
  ["packages", "Packages"],
  ["chains", "Supported chains"],
  ["notes", "Good to know"],
];

const features: { id: string; title: string; body: React.ReactNode; code?: string }[] = [
  {
    id: "fast",
    title: "Fast lane",
    body: <>Set <code>fast: true</code> and attestation takes seconds instead of waiting for finality. The SDK fetches the current minimum fee from Iris, so you don’t hardcode one.</>,
  },
  {
    id: "resume",
    title: "Resume",
    body: <>Progress is saved to localStorage in the browser and to a temp file in Node. If a user closes the tab mid-transfer, resume by id, or recover from nothing but the burn transaction hash.</>,
    code: resumeCode,
  },
  {
    id: "hooks",
    title: "Destination hooks",
    body: <>CCTP v2 carries hookData but never runs it. A hook executor contract on the destination is both the mint recipient and the only allowed caller, so the hook runs in the same transaction and a relayer can’t swap in its own instructions. If the hook reverts, USDC goes back to the sender. A transfer with a hook and no executor fails with <code>HOOK_EXECUTOR_REQUIRED</code> instead of silently minting plain USDC.</>,
    code: hookCode,
  },
  {
    id: "fees",
    title: "Fee estimates",
    body: <>Gas, bridge fee and expected duration, available before the user signs anything.</>,
    code: feeCode,
  },
  {
    id: "react",
    title: "React bindings",
    body: <>A provider, two hooks and a status badge that follows the transfer state.</>,
    code: reactCode,
  },
  {
    id: "errors",
    title: "Typed errors",
    body: <><code>CctpError</code>, <code>UnsupportedChainError</code>, <code>AttestationApiError</code>, <code>AttestationTimeoutError</code>, <code>InvalidStateTransitionError</code> and <code>MessageParseError</code>. Each one tells you which step failed.</>,
  },
];

export default function Home() {
  return (
    <>
      <header className="top">
        <div className="top-in">
          <a href="#top" className="brand"><span className="brand-mark" aria-hidden="true" />cctp-sdk</a>
          <span className="top-links">
            <a href="https://www.npmjs.com/org/cctp-sdk">npm</a>
            <a href="https://github.com/Godbrand0/cctp_sdk">GitHub</a>
          </span>
        </div>
      </header>

      <div className="hero" id="top">
        <h1>Move USDC between chains with one function call.</h1>
        <p className="lead">
          Burn on one chain, mint on another. The SDK handles the approval, the burn, Circle’s
          attestation and the relay, and picks up where it left off if the tab closes.
        </p>
        <Install />
        <Simulator />
      </div>

      <div className="shell">
        <aside><Toc items={toc} /></aside>
        <main>
          <section id="why">
            <h2>Why it exists</h2>
            <p>Raw CCTP v2 asks you to get seven things right, in order. A mistake in step five costs a stuck transfer.</p>
            <div className="compare">
              <div>
                <h3>By hand</h3>
                <ol className="steps">{manualSteps.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
              <div>
                <h3>With the SDK</h3>
                <Code>{quickStart}</Code>
              </div>
            </div>
          </section>

          <section id="options">
            <h2>Transfer options</h2>
            <Table head={["Field", "Type", "What it does"]} rows={params} />
          </section>

          <section id="features">
            <h2>What it handles</h2>
            <dl className="features">
              {features.map((f) => (
                <div key={f.id} className="feature">
                  <dt>{f.title}</dt>
                  <dd>
                    <p>{f.body}</p>
                    {f.code && <Code>{f.code}</Code>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="stellar">
            <h2>Receiving on Stellar</h2>
            <p>
              Circle’s forwarder on Stellar mints USDC and transfers it to the address in the
              hookData. That address is attested, so it can’t be redirected, but the forwarder never
              calls it. A contract that has to act for a particular user, such as a swap with a
              slippage floor, a vault deposit or an anchor credit, has no attested way to know who a
              deposit is for. <code>@cctp-sdk/stellar</code> appends the final recipient and a
              minimum-output floor to the burn’s hookData, and the contract reads them back out of
              the attested message.
            </p>
            <HookDataDiagram />
            <Code>{stellarCode}</Code>
            <div className="callout">
              <h3>Pre-alpha: not verified yet</h3>
              <ul>
                <li>The mainnet forwarder address comes from Circle’s docs and hasn’t been checked on-chain.</li>
                <li>The trailing hookData section is a convention, seen working on testnet only.</li>
                <li>The live Soroban path (<code>RpcInvoker</code>) hasn’t run against a network.</li>
                <li>The Rust crate hasn’t had an external audit.</li>
              </ul>
            </div>
          </section>

          <section id="packages">
            <h2>Packages</h2>
            <ul className="pkgs">
              {packages.map((p) => (
                <li key={p.name}>
                  <div>
                    <code>{p.name}</code>
                    <span className="muted">{p.version}</span>
                    {"npm" in p && <a className="muted" href={p.npm}>View on npm</a>}
                  </div>
                  <p>{p.blurb}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="chains">
            <h2>Supported chains</h2>
            <Chains />
            <p className="muted">Stellar is CCTP domain 27 and is handled by <code>@cctp-sdk/stellar</code>.</p>
          </section>

          <section id="notes">
            <h2>Good to know</h2>
            <ul className="notes">
              <li>USDC has 6 decimals on every supported chain, Arc testnet included.</li>
              <li>Fast transfers carry a minimum Circle fee, about 1.3 USDC on testnet.</li>
              <li>CCTP v2 event logs encode the nonce as zero, so the SDK relays with the message bytes Iris returns.</li>
              <li>If source and destination need different signers, pass a second wallet client to <code>transfer()</code>.</li>
            </ul>
          </section>
        </main>
      </div>

      <footer className="foot">
        <span>MIT licensed</span>
        <span className="top-links">
          <a href="https://www.npmjs.com/org/cctp-sdk">npmjs.com/org/cctp-sdk</a>
          <a href="https://github.com/Godbrand0/cctp_sdk">github.com/Godbrand0/cctp_sdk</a>
        </span>
      </footer>
    </>
  );
}
