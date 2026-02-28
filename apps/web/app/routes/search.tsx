import { useState, useEffect, useRef } from "react";
import { Form, Link, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/search";
import { hybridSearch, type HybridSearchResult } from "../lib/api";
import { Layout } from "~/components/layout";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Search, X, FileText, Sparkles } from "lucide-react";

// ---------------------------------------------------------------------------
// Loader — run search server-side when ?q= is present
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return { results: null, query: "", total: 0 };
  try {
    const data = await hybridSearch(q);
    return { results: data.results, query: data.query, total: data.total };
  } catch {
    return { results: [], query: q, total: 0 };
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta({ data }: Route.MetaArgs) {
  const title = data?.query ? `Search: ${data.query} — Holocron` : "Search — Holocron";
  return [{ title }];
}

// ---------------------------------------------------------------------------
// Highlight helper
// ---------------------------------------------------------------------------

function highlightText(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200/50 dark:bg-yellow-800/30 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const loaderData = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSearching = navigation.state === "loading" && new URLSearchParams(navigation.location?.search).has("q");

  // Two-phase render: start with fast RRF results, then refine with LLM reranking
  const [displayResults, setDisplayResults] = useState<HybridSearchResult[] | null>(loaderData.results);
  const [isReranking, setIsReranking] = useState(false);
  const rerankAbortRef = useRef<AbortController | null>(null);

  // Sync displayResults when loader data changes (new search or navigation)
  useEffect(() => {
    setDisplayResults(loaderData.results);
  }, [loaderData.results]);

  // Client-side reranking effect
  useEffect(() => {
    // Abort any in-flight rerank request
    rerankAbortRef.current?.abort();

    if (!loaderData.results || loaderData.results.length === 0 || !loaderData.query) {
      setIsReranking(false);
      return;
    }

    const abortController = new AbortController();
    rerankAbortRef.current = abortController;
    setIsReranking(true);

    fetch("/api/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: loaderData.query, results: loaderData.results }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`rerank failed: ${res.status}`);
        return res.json();
      })
      .then((data: { results: HybridSearchResult[] }) => {
        if (!abortController.signal.aborted) {
          setDisplayResults(data.results);
          setIsReranking(false);
        }
      })
      .catch(() => {
        // Graceful degradation — keep original RRF results
        if (!abortController.signal.aborted) {
          setIsReranking(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [loaderData.results, loaderData.query]);

  const query = loaderData.query;
  const total = displayResults?.length ?? loaderData.total;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Search form */}
        <Form method="get" action="/search" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search your vault…"
            autoFocus
            className="h-11 pl-10 pr-10 text-sm"
          />
          {query && (
            <Link
              to="/search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </Link>
          )}
        </Form>

        {/* Loading skeleton */}
        {isSearching && <SearchSkeleton />}

        {/* No query yet */}
        {!isSearching && displayResults === null && <EmptyPrompt />}

        {/* Query with no results */}
        {!isSearching && displayResults !== null && displayResults.length === 0 && <NoResults query={query} />}

        {/* Results */}
        {!isSearching && displayResults !== null && displayResults.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {total} {total === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
              </p>
              {isReranking && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
                  <Sparkles className="size-3" />
                  Refining results…
                </span>
              )}
            </div>
            {displayResults.map((result) => (
              <ResultItem key={result.file.id} result={result} query={query} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyPrompt() {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-muted-foreground">
      <Search className="size-10 opacity-30" />
      <p className="text-sm">Search your vault</p>
      <p className="text-xs">Find files by content, name, or metadata</p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-muted-foreground">
      <FileText className="size-10 opacity-30" />
      <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
      <p className="text-xs">Try different keywords or check your spelling</p>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}

function ResultItem({ result, query }: { result: HybridSearchResult; query: string }) {
  const displayType = result.file.mimeType.split("/").pop() ?? result.file.mimeType;
  const visibleChunks = result.chunks.slice(0, 3);

  return (
    <div className="group space-y-2">
      <div className="flex items-center gap-2">
        <Link
          to={`/files/${result.file.id}`}
          className="text-sm font-medium text-foreground hover:underline underline-offset-4"
        >
          {result.file.name}
        </Link>
        <Badge variant="secondary" className="text-[10px]">
          {displayType}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {result.topScore}/10
        </Badge>
        {result.chunks.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {result.chunks.length} {result.chunks.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {result.file.path !== result.file.name && <p className="text-[10px] text-muted-foreground">{result.file.path}</p>}

      {visibleChunks.length > 0 && (
        <div className="space-y-1.5">
          {visibleChunks.map((chunk) => (
            <div
              key={chunk.chunkIndex}
              className="border-l-2 border-muted pl-3 text-xs text-muted-foreground leading-relaxed"
            >
              {chunk.page != null && (
                <span className="mr-1.5 text-[10px] font-medium text-muted-foreground/60">p.{chunk.page}</span>
              )}
              <span className="mr-1.5 text-[10px] font-medium text-muted-foreground/60">
                [{chunk.relevanceScore}/10]
              </span>
              {highlightText(truncate(chunk.text), query)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
