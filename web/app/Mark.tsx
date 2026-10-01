// The brand mark: the pulse line on Signal (same drawing as app/icon.svg).
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#e4572e" />
      <path d="M8 36h12l5-14 8 26 6-18 4 6h13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
