import { useState } from "react";
import { Button } from "~/components/ui/button";

interface PdfPreviewProps {
  downloadUrl: string;
}

export function PdfPreview({ downloadUrl }: PdfPreviewProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">
          PDF preview not available
        </p>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3"
        >
          <Button variant="outline" size="sm">
            Download PDF
          </Button>
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={downloadUrl}
      title="PDF preview"
      className="h-[80vh] w-full rounded-md border"
      onError={() => setError(true)}
    />
  );
}

