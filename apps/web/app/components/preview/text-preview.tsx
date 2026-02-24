import { useEffect, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";

interface TextPreviewProps {
  downloadUrl: string;
}

export function TextPreview({ downloadUrl }: TextPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(downloadUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [downloadUrl]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">Failed to load file content</p>
        <p className="mt-1 text-xs text-destructive">{error}</p>
      </div>
    );
  }

  const lines = (content ?? "").split("\n");

  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-md bg-muted">
      <pre className="p-4 text-sm leading-relaxed">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="mr-4 inline-block w-8 shrink-0 select-none text-right text-xs text-muted-foreground">
                {i + 1}
              </span>
              <span className="whitespace-pre-wrap break-all font-mono">{line}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
