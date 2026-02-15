import { Link } from "react-router";
import { Download, Share2 } from "lucide-react";
import type { HolocronFile } from "@holocron/core/types";
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

interface FileTableProps {
  files: HolocronFile[];
  copiedFileId: string | null;
  onDownload: (id: string) => void;
  onShare: (id: string) => void;
  formatBytes: (bytes: number) => string;
  formatDate: (d: string | Date) => string;
}

export function FileTable({
  files,
  copiedFileId,
  onDownload,
  onShare,
  formatBytes,
  formatDate,
}: FileTableProps) {
  if (files.length === 0) {
    return (
      <p className="py-12 text-center text-xs text-muted-foreground">
        No files yet. Drop files above to upload.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Name</TableHead>
          <TableHead className="text-xs">Size</TableHead>
          <TableHead className="text-xs">Type</TableHead>
          <TableHead className="text-xs">Date</TableHead>
          <TableHead className="w-[140px] text-xs" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow key={file.id} className="hover:bg-muted/50 transition-colors">
            <TableCell className="text-xs">
              <Link
                to={`/files/${file.id}`}
                className="hover:underline"
              >
                {file.path !== file.name && (
                  <span className="text-muted-foreground">
                    {file.path.slice(0, file.path.length - file.name.length)}
                  </span>
                )}
                {file.name}
              </Link>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatBytes(file.size)}
            </TableCell>
            <TableCell className="text-xs">
              <Badge variant="secondary" className="text-[10px] font-normal">
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
                {file.indexingStatus && (
                  <Badge variant="outline" className="ml-1 text-[10px] font-normal">
                    {file.indexingStatus}
                  </Badge>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

