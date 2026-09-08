const DISCLOSURE =
  "Independent prototype — external institutional integrations may be simulated unless marked live.";

export function PrototypeNotice({ extra }: { extra?: string }) {
  return (
    <div className="notice">
      {DISCLOSURE}
      {extra ? ` ${extra}` : ""}
    </div>
  );
}

export { DISCLOSURE };
