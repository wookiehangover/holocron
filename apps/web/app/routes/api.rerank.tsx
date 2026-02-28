import { data } from "react-router";
import type { Route } from "./+types/api.rerank";
import { rerankSearch, type HybridSearchResult } from "~/lib/api";

// ---------------------------------------------------------------------------
// Resource route — rerank search results server-side
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const body = await request.json();
  const query = body.query as string;
  const results = body.results as HybridSearchResult[];

  if (!query || !results) {
    return data({ error: "query and results are required" }, { status: 400 });
  }

  try {
    const reranked = await rerankSearch(query, results);
    return { results: reranked.results, query: reranked.query, total: reranked.total };
  } catch (e) {
    return data({ error: (e as Error).message }, { status: 500 });
  }
}

