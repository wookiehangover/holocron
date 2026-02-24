import { useRef } from "react";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type UploadState = "idle" | "dragover" | "uploading" | "done" | "error";

interface UploadZoneProps {
  uploadState: UploadState;
  errorMessage?: string | null;
  onUpload: (files: FileList | null) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export function UploadZone({ uploadState, errorMessage, onUpload, onDragOver, onDragLeave, onDrop }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card
      className={cn(
        "flex cursor-pointer items-center justify-center border-2 border-dashed py-8 transition-colors",
        uploadState === "dragover"
          ? "border-primary bg-accent"
          : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-accent/50",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
      <div className="flex flex-col items-center gap-3 text-center">
        {uploadState === "uploading" && (
          <>
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Uploading…</p>
          </>
        )}
        {uploadState === "done" && (
          <>
            <CheckCircle className="size-5 text-emerald-500" />
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Upload complete!</p>
          </>
        )}
        {uploadState === "error" && (
          <>
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-xs text-destructive">Upload failed{errorMessage ? `: ${errorMessage}` : ""}</p>
          </>
        )}
        {(uploadState === "idle" || uploadState === "dragover") && (
          <>
            <Upload className="size-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Drop files here or click to upload</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Upload className="size-3.5" />
              Upload Files
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
