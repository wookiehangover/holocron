interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * System 7-style modal confirmation dialog.
 * Uses system.css classes: .outer-border > .inner-border > .modal-dialog, .btn, .btn-default
 */
export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--s7-dialog-overlay, rgba(0, 0, 0, 0.15))",
      }}
      onClick={onCancel}
    >
      <div className="outer-border" onClick={(e) => e.stopPropagation()}>
        <div className="inner-border">
          <div
            style={{
              padding: 16,
              fontFamily: "Chicago_12, Chicago, sans-serif",
              fontSize: 14,
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              maxWidth: 400,
            }}
          >
            {/* Alert icon — classic Mac caution triangle */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <path d="M16 2 L30 28 L2 28 Z" fill="#ffcc00" stroke="currentColor" strokeWidth="2" />
              <text
                x="16"
                y="24"
                textAnchor="middle"
                fontFamily="Chicago_12, Chicago, sans-serif"
                fontSize="18"
                fontWeight="bold"
                fill="currentColor"
              >
                !
              </text>
            </svg>

            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 16 }}>{message}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" onClick={onCancel}>
                  Cancel
                </button>
                <button className="btn btn-default" onClick={onConfirm}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

