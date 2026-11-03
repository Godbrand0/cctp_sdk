import { CopyButton } from "./CopyButton";

const re =
  /(\/\/.*)|("(?:[^"\\]|\\.)*")|\b(import|from|const|await|new|true|false|return|type)\b|(\b\d+n?\b)/g;

function highlight(src: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const cls = m[1] ? "tk-c" : m[2] ? "tk-s" : m[3] ? "tk-k" : "tk-n";
    out.push(<span key={m.index} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  out.push(src.slice(last));
  return out;
}

export function Code({ children, title }: { children: string; title?: string }) {
  return (
    <figure className="codeblock">
      <figcaption>
        <span>{title ?? "typescript"}</span>
        <CopyButton text={children} />
      </figcaption>
      <pre tabIndex={0}><code>{highlight(children)}</code></pre>
    </figure>
  );
}
