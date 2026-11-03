export function HookDataDiagram() {
  return (
    <figure className="hookdata" aria-label="Layout of the burn's hookData">
      <div className="hd-bar">
        <div className="hd-seg hd-forwarder">Circle forwarder format</div>
        <div className="hd-seg hd-recipient">Final recipient</div>
        <div className="hd-seg hd-floor">Min-output floor</div>
      </div>
      <div className="hd-labels">
        <p className="hd-forwarder-l"><strong>CctpForwarder reads this</strong> and mints USDC to the forwarding address.</p>
        <p className="hd-trailing-l"><strong>Your Soroban contract reads this</strong> from the same attested message. The forwarder ignores it, and a relayer can’t change it.</p>
      </div>
    </figure>
  );
}
