export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="brand-mark"
    >
      <rect
        x="4.5"
        y="7.5"
        width="23"
        height="19"
        rx="5"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path d="M4.5 13.5h23" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M11 20h10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
