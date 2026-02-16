import { useState, useEffect } from "react";
import type { HolocronFile } from "@holocron/core/types";

function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  return [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-yaml",
    "application/x-sh",
  ].includes(mime);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface FilePreviewWindowProps {
  file: HolocronFile;
  downloadUrl: string;
}

/**
 * Renders a file preview inside the window pane.
 * - Images: <img> tag
 * - Text/code: fetched text content
 * - PDF: <iframe>
 * - Other: file info + download link
 */
export function FilePreviewWindow({ file, downloadUrl }: FilePreviewWindowProps) {
  const mime = file.mimeType ?? "";

  if (mime.startsWith("image/")) {
    return <ImagePreview url={downloadUrl} name={file.name} />;
  }

  if (isTextMime(mime)) {
    return <TextPreview url={downloadUrl} name={file.name} />;
  }

  if (mime === "application/pdf") {
    return <PdfPreview url={downloadUrl} name={file.name} />;
  }

  return <GenericPreview file={file} downloadUrl={downloadUrl} />;
}

/* ------------------------------------------------------------------ */

function ImagePreview({ url, name }: { url: string; name: string }) {
  return (
    <div style={{ padding: 8, textAlign: "center" }}>
      <img
        src={url}
        alt={name}
        style={{ maxWidth: "100%", maxHeight: "100%", imageRendering: "auto" }}
      />
    </div>
  );
}

function TextPreview({ url, name }: { url: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.text();
      })
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div style={{ padding: 8, fontFamily: "Geneva_9, Geneva, sans-serif", fontSize: 12 }}>
        Error loading {name}: {error}
      </div>
    );
  }

  if (text === null) {
    return (
      <div style={{ padding: 8, fontFamily: "Geneva_9, Geneva, sans-serif", fontSize: 12 }}>
        Loading…
      </div>
    );
  }

  return (
    <pre
      style={{
        padding: 8,
        margin: 0,
        fontFamily: "Monaco, Courier, monospace",
        fontSize: 11,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        tabSize: 4,
      }}
    >
      {text}
    </pre>
  );
}

function PdfPreview({ url, name }: { url: string; name: string }) {
  return (
    <iframe
      src={url}
      title={name}
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}

function GenericPreview({
  file,
  downloadUrl,
}: {
  file: HolocronFile;
  downloadUrl: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        fontFamily: "Geneva_9, Geneva, sans-serif",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div><strong>Name:</strong> {file.name}</div>
      <div><strong>Type:</strong> {file.mimeType ?? "Unknown"}</div>
      <div><strong>Size:</strong> {formatBytes(file.size)}</div>
      <div style={{ marginTop: 8 }}>
        <a
          href={downloadUrl}
          download={file.name}
          className="btn"
          style={{ textDecoration: "none" }}
        >
          Download
        </a>
      </div>
    </div>
  );
}

