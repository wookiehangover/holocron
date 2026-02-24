import { useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";

interface ImagePreviewProps {
  downloadUrl: string;
  fileName: string;
}

export function ImagePreview({ downloadUrl, fileName }: ImagePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">Failed to load image preview</p>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-xs text-primary underline underline-offset-4 hover:text-primary/80"
        >
          Open image directly
        </a>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && <Skeleton className="aspect-video w-full rounded-md" />}
      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={downloadUrl}
          alt={fileName}
          className={`max-w-full rounded-md transition-opacity ${loading ? "absolute inset-0 opacity-0" : "opacity-100"}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      </a>
      {!loading && <p className="mt-1.5 text-xs text-muted-foreground">Click image to open full size</p>}
    </div>
  );
}
