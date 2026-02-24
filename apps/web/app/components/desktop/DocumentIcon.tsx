/**
 * Classic Mac document icon — 24×32 pixel grid, monochrome.
 * Rectangle with dog-eared (folded) top-right corner, lines suggesting text.
 */
export function DocumentIcon({ size = 32 }: { size?: number }) {
  const w = (24 / 32) * size;
  return (
    <svg width={w} height={size} viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Document body with dog-ear */}
      <path
        d="M2 1 L16 1 L22 7 L22 31 L2 31 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="var(--s7-icon-fill, white)"
      />
      {/* Dog-ear fold */}
      <path d="M16 1 L16 7 L22 7" stroke="currentColor" strokeWidth="1" fill="var(--s7-icon-fill, white)" />
      {/* Text lines */}
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="20" x2="19" y2="20" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="24" x2="14" y2="24" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
