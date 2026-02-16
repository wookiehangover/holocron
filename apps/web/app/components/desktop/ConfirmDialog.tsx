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
      className="s7-dialog-overlay fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onCancel}
    >
      <div className="outer-border" onClick={(e) => e.stopPropagation()}>
        <div className="inner-border">
          <div className="flex items-start gap-[16px] p-[16px] max-w-[400px]">
            {/* Alert icon — classic Mac caution triangle */}
            <svg
              className="shrink-0"
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
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

            <div className="flex-1">
              <div className="mb-[16px]">{message}</div>
              <div className="flex justify-end gap-[8px]">
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

