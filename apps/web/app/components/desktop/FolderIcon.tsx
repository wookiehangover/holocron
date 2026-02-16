/**
 * Classic Mac folder icon — 32×32 pixel grid, monochrome.
 * Rectangular body with a tab on the top-left.
 */
export function FolderIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Tab on top-left */}
      <path
        d="M2 8 L2 6 L12 6 L14 8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="var(--s7-icon-fill, white)"
      />
      {/* Folder body */}
      <rect
        x="2"
        y="8"
        width="28"
        height="20"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="var(--s7-icon-fill, white)"
      />
      {/* Horizontal line near top of body */}
      <line x1="2" y1="12" x2="30" y2="12" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

