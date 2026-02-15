import { useLoaderData } from "react-router";
import { resolveShareLink } from "../lib/api";
import type { Route } from "./+types/share.$token";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// Loader — resolve share token server-side
// ---------------------------------------------------------------------------

type ShareData =
  | { ok: true; file: { name: string; size: number; mimeType: string }; downloadUrl: string }
  | { ok: false; status: number };

export async function loader({ params }: Route.LoaderArgs) {
  try {
    const data = await resolveShareLink(params.token);
    return { ok: true as const, file: data.file, downloadUrl: data.downloadUrl };
  } catch (e: any) {
    const status: number = e.status ?? 500;
    return { ok: false as const, status };
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta() {
  return [
    { title: "Shared File — Holocron" },
    { name: "description", content: "Download a shared file" },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SharePage() {
  const data = useLoaderData<typeof loader>();

  if (!data.ok) {
    const heading =
      data.status === 410
        ? "This share link has expired"
        : data.status === 404
          ? "Share link not found"
          : "Something went wrong";
    const detail =
      data.status === 410
        ? "The owner may need to create a new share link."
        : data.status === 404
          ? "This link may have been removed or is invalid."
          : "Please try again later.";

    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-lg font-semibold mb-2">{heading}</h1>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </main>
    );
  }

  const { file, downloadUrl } = data;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <h1 className="text-lg font-semibold text-center mb-6">Holocron</h1>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-sm">{file.name}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)} · {file.mimeType}
            </p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button asChild>
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

