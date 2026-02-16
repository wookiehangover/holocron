/**
 * Classic Mac trash can icon — 32×32 pixel grid, monochrome.
 * Tapered body with horizontal ridges, small lid on top.
 */
export function TrashIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Lid */}
      <rect
        x="8"
        y="4"
        width="16"
        height="3"
        rx="0.5"
        stroke="black"
        strokeWidth="1.5"
        fill="white"
      />
      {/* Lid handle */}
      <rect x="13" y="2" width="6" height="2" stroke="black" strokeWidth="1" fill="white" />
      {/* Tapered body */}
      <path
        d="M7 7 L25 7 L23 30 L9 30 Z"
        stroke="black"
        strokeWidth="1.5"
        fill="white"
      />
      {/* Horizontal ridges */}
      <line x1="9" y1="12" x2="23" y2="12" stroke="black" strokeWidth="1" />
      <line x1="9.5" y1="17" x2="22.5" y2="17" stroke="black" strokeWidth="1" />
      <line x1="9.5" y1="22" x2="22.5" y2="22" stroke="black" strokeWidth="1" />
      <line x1="10" y1="27" x2="22" y2="27" stroke="black" strokeWidth="1" />
    </svg>
  );
}

