import { Link, useSearchParams } from "react-router";
import {
  Download,
  Share2,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronUp,
  ChevronDown,
  Folder,
} from "lucide-react";
import type { HolocronFile, IndexingStatus } from "@holocron/core/types";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "~/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Indexing status → icon + tooltip mapping
// ---------------------------------------------------------------------------

function IndexingStatusIcon({ status }: { status?: IndexingStatus }) {
  if (!status) return null;
  switch (status) {
    case "pending":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Clock className="ml-1 size-3.5 text-amber-500" />
          </TooltipTrigger>
          <TooltipContent>Pending indexing</TooltipContent>
        </Tooltip>
      );
    case "extracting":
    case "chunking":
    case "indexing":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Loader2 className="ml-1 size-3.5 animate-spin text-blue-500" />
          </TooltipTrigger>
          <TooltipContent>Indexing…</TooltipContent>
        </Tooltip>
      );
    case "indexed":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCircle2 className="ml-1 size-3.5 text-emerald-500" />
          </TooltipTrigger>
          <TooltipContent>Indexed</TooltipContent>
        </Tooltip>
      );
    case "failed":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <XCircle className="ml-1 size-3.5 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>Indexing failed</TooltipContent>
        </Tooltip>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Sortable header
// ---------------------------------------------------------------------------

type SortParam = "name" | "size" | "mime_type" | "created_at";

const COLUMN_SORT: { label: string; param: SortParam }[] = [
  { label: "Name", param: "name" },
  { label: "Size", param: "size" },
  { label: "Type", param: "mime_type" },
  { label: "Date", param: "created_at" },
];

function SortableHead({
  label,
  param,
  currentSort,
  currentDir,
}: {
  label: string;
  param: SortParam;
  currentSort: string | null;
  currentDir: string | null;
}) {
  const [, setSearchParams] = useSearchParams();

  const isActive = currentSort === param;
  const nextDir = !isActive ? "asc" : currentDir === "asc" ? "desc" : null;

  function handleClick() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextDir === null) {
        next.delete("sort");
        next.delete("dir");
      } else {
        next.set("sort", param);
        next.set("dir", nextDir);
      }
      return next;
    });
  }

  return (
    <TableHead
      className="text-xs cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive && currentDir === "asc" && <ChevronUp className="size-3" />}
        {isActive && currentDir === "desc" && (
          <ChevronDown className="size-3" />
        )}
      </span>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// FileTable
// ---------------------------------------------------------------------------

interface FileTableProps {
  files: HolocronFile[];
  folders?: { name: string; fileCount: number }[];
  currentFolder?: string | null;
  copiedFileId: string | null;
  onDownload: (id: string) => void;
  onShare: (id: string) => void;
  formatBytes: (bytes: number) => string;
  formatDate: (d: string | Date) => string;
  sort?: string | null;
  dir?: string | null;
}

export function FileTable({
  files,
  folders = [],
  currentFolder = null,
  copiedFileId,
  onDownload,
  onShare,
  formatBytes,
  formatDate,
  sort = null,
  dir = null,
}: FileTableProps) {
  const [searchParams] = useSearchParams();

  if (files.length === 0 && folders.length === 0) {
    return (
      <p className="py-12 text-center text-xs text-muted-foreground">
        No files yet. Drop files above to upload.
      </p>
    );
  }

  function buildFolderUrl(folderName: string) {
    const next = new URLSearchParams(searchParams);
    const path = currentFolder
      ? `${currentFolder}/${folderName}`
      : folderName;
    next.set("folder", path);
    return `/?${next.toString()}`;
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMN_SORT.map((col) => (
              <SortableHead
                key={col.param}
                label={col.label}
                param={col.param}
                currentSort={sort}
                currentDir={dir}
              />
            ))}
            <TableHead className="w-[140px] text-xs" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {folders.map((f) => (
            <TableRow
              key={`folder-${f.name}`}
              className="hover:bg-muted/50 transition-colors"
            >
              <TableCell className="text-xs">
                <Link
                  to={buildFolderUrl(f.name)}
                  className="hover:underline inline-flex items-center gap-1.5"
                >
                  <Folder className="size-4 text-muted-foreground" />
                  {f.name}
                </Link>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {f.fileCount} {f.fileCount === 1 ? "file" : "files"}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
            </TableRow>
          ))}
          {files.map((file) => (
            <TableRow
              key={file.id}
              className="hover:bg-muted/50 transition-colors"
            >
              <TableCell className="text-xs">
                <Link
                  to={`/files/${file.id}`}
                  className="hover:underline inline-flex items-center gap-1"
                >
                  {file.name}
                </Link>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </TableCell>
              <TableCell className="text-xs">
                <Badge
                  variant="secondary"
                  className="text-[10px] font-normal"
                >
                  {file.mimeType}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(file.createdAt)}
              </TableCell>
              <TableCell className="text-xs">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onDownload(file.id)}
                  >
                    <Download className="size-3" />
                    <span className="sr-only">Download</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onShare(file.id)}
                    className={
                      copiedFileId === file.id
                        ? "text-emerald-600 dark:text-emerald-400"
                        : ""
                    }
                  >
                    <Share2 className="size-3" />
                    <span className="text-[10px]">
                      {copiedFileId === file.id ? "Copied!" : "Share"}
                    </span>
                  </Button>
                  <IndexingStatusIcon status={file.indexingStatus} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}

