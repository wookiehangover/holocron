import type { HolocronFile } from "@holocron/core/types";
import { DocumentIcon } from "./DocumentIcon";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanMimeType(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "JPEG Image",
    "image/png": "PNG Image",
    "image/gif": "GIF Image",
    "image/webp": "WebP Image",
    "image/svg+xml": "SVG Image",
    "application/pdf": "PDF Document",
    "text/plain": "Plain Text",
    "text/markdown": "Markdown Document",
    "text/html": "HTML Document",
    "text/css": "CSS Stylesheet",
    "application/json": "JSON Document",
    "application/javascript": "JavaScript File",
    "application/zip": "ZIP Archive",
  };
  if (map[mime]) return map[mime];
  if (mime.startsWith("image/")) return `${mime.split("/")[1].toUpperCase()} Image`;
  if (mime.startsWith("text/")) return `${mime.split("/")[1].toUpperCase()} Text`;
  if (mime.startsWith("audio/")) return `${mime.split("/")[1].toUpperCase()} Audio`;
  if (mime.startsWith("video/")) return `${mime.split("/")[1].toUpperCase()} Video`;
  return mime;
}

const labelStyle: React.CSSProperties = {
  fontWeight: "bold",
  minWidth: 80,
  textAlign: "right",
  paddingRight: 8,
  whiteSpace: "nowrap",
};

const valueStyle: React.CSSProperties = {
  flex: 1,
  wordBreak: "break-word",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  padding: "2px 0",
};

interface GetInfoWindowProps {
  file: HolocronFile;
}

export function GetInfoWindow({ file }: GetInfoWindowProps) {
  const meta = file.metadata;

  return (
    <div style={{ padding: "12px 16px", fontSize: 12, lineHeight: 1.5 }}>
      {/* Header: icon + file name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <DocumentIcon size={48} />
        <strong style={{ fontSize: 14 }}>{file.name}</strong>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--s7-fg, #000)", margin: "8px 0" }} />

      {/* Core file info */}
      <div style={rowStyle}>
        <span style={labelStyle}>Kind:</span>
        <span style={valueStyle}>{humanMimeType(file.mimeType)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Size:</span>
        <span style={valueStyle}>
          {formatBytes(file.size)} ({file.size.toLocaleString()} bytes)
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Where:</span>
        <span style={valueStyle}>{file.path}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Created:</span>
        <span style={valueStyle}>{formatDate(file.createdAt)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Modified:</span>
        <span style={valueStyle}>{formatDate(file.updatedAt)}</span>
      </div>

      {meta?.imageWidth && meta?.imageHeight && (
        <div style={rowStyle}>
          <span style={labelStyle}>Dimensions:</span>
          <span style={valueStyle}>
            {meta.imageWidth} × {meta.imageHeight} pixels
          </span>
        </div>
      )}

      {meta?.pageCount && (
        <div style={rowStyle}>
          <span style={labelStyle}>Pages:</span>
          <span style={valueStyle}>{meta.pageCount}</span>
        </div>
      )}

      {meta?.wordCount && (
        <div style={rowStyle}>
          <span style={labelStyle}>Words:</span>
          <span style={valueStyle}>{meta.wordCount.toLocaleString()}</span>
        </div>
      )}

      {/* AI metadata section */}
      {meta && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid var(--s7-fg, #000)", margin: "8px 0" }} />

          {meta.summary && (
            <div style={rowStyle}>
              <span style={labelStyle}>Summary:</span>
              <span style={valueStyle}>{meta.summary}</span>
            </div>
          )}

          {meta.keywords && meta.keywords.length > 0 && (
            <div style={rowStyle}>
              <span style={labelStyle}>Keywords:</span>
              <span style={valueStyle}>{meta.keywords.join(", ")}</span>
            </div>
          )}

          {meta.topics && meta.topics.length > 0 && (
            <div style={rowStyle}>
              <span style={labelStyle}>Topics:</span>
              <span style={valueStyle}>{meta.topics.join(", ")}</span>
            </div>
          )}

          {meta.language && (
            <div style={rowStyle}>
              <span style={labelStyle}>Language:</span>
              <span style={valueStyle}>{meta.language}</span>
            </div>
          )}

          {meta.author && (
            <div style={rowStyle}>
              <span style={labelStyle}>Author:</span>
              <span style={valueStyle}>{meta.author}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
