"use client";
import { useState } from "react";
import { CopyButton } from "./CopyButton";

const cmds = {
  npm: "npm install @cctp-sdk/core viem",
  pnpm: "pnpm add @cctp-sdk/core viem",
  yarn: "yarn add @cctp-sdk/core viem",
} as const;

export function Install() {
  const [pm, setPm] = useState<keyof typeof cmds>("npm");
  return (
    <div className="install">
      <div role="tablist" aria-label="Package manager">
        {(Object.keys(cmds) as (keyof typeof cmds)[]).map((k) => (
          <button key={k} role="tab" aria-selected={pm === k} onClick={() => setPm(k)}>{k}</button>
        ))}
      </div>
      <div className="install-cmd">
        <code>{cmds[pm]}</code>
        <CopyButton text={cmds[pm]} />
      </div>
    </div>
  );
}
