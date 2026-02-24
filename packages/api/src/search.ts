/**
 * Hybrid search module for Holocron.
 *
 * Combines full-text search, vector similarity search, Reciprocal Rank Fusion,
 * and LLM-based reranking (Gemini 3 Flash) to return the most relevant results.
 */

import { embed, generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {
  searchChunksByFullText,
  searchChunksByEmbedding,
  searchChunks,
  searchFilesByMetadata,
  getFilesByIds,
  getTopChunksByFileIds,
} from "./db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HybridSearchResult {
  file: {
    id: string;
    name: string;
    path: string;
    mimeType: string;
    metadata?: unknown;
  };
  chunks: Array<{
    id: string;
    text: string;
    page?: number;
    chunkIndex: number;
    relevanceScore: number;
  }>;
  topScore: number;
}

interface FusedChunk {
  id: string;
  fileId: string;
  fileName: string;
  text: string;
  page?: number;
  chunkIndex: number;
  rrfScore: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** RRF smoothing constant. */
const RRF_K = 60;

/** Number of top fused results to rerank with the LLM. */
const RERANK_LIMIT = 30;

/** Minimum relevance score (1-10) to keep a chunk. */
const MIN_RELEVANCE_SCORE = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reciprocal Rank Fusion: merge multiple ranked lists by chunk ID.
 * Score = Σ 1/(k + rank) where rank is 1-based position.
 */
function reciprocalRankFusion(
  ...resultLists: Array<Array<{ id: string; fileId: string; fileName: string; text: string; page?: number; chunkIndex: number }>>
): FusedChunk[] {
  const scoreMap = new Map<string, FusedChunk>();

  const addScores = (
    results: Array<{ id: string; fileId: string; fileName: string; text: string; page?: number; chunkIndex: number }>,
  ) => {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rank = i + 1;
      const score = 1 / (RRF_K + rank);
      const existing = scoreMap.get(r.id);
      if (existing) {
        existing.rrfScore += score;
      } else {
        scoreMap.set(r.id, {
          id: r.id,
          fileId: r.fileId,
          fileName: r.fileName,
          text: r.text,
          page: r.page,
          chunkIndex: r.chunkIndex,
          rrfScore: score,
        });
      }
    }
  };

  for (const list of resultLists) {
    addScores(list);
  }

  return [...scoreMap.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * Rerank chunks using a single Gemini 3 Flash call that scores all chunks at once.
 * Falls back to mapping RRF scores to 1-10 range if the LLM call fails.
 */
async function rerankChunks(
  query: string,
  chunks: FusedChunk[],
): Promise<Array<FusedChunk & { relevanceScore: number }>> {
  if (chunks.length === 0) return [];

  try {
    // Build a single prompt with all chunks numbered
    const chunksText = chunks
      .map((c, i) => `Chunk ${i + 1}:\n${c.text}`)
      .join("\n\n");

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash"),
      system: `Score each text chunk on relevance to the query (1-10).
10: Perfectly answers the query
7-9: Contains most needed information
5-6: Contains some relevant information
3-4: Minimal relevance
1-2: No relevance
Return ONLY a JSON array of integers, one per chunk, in the same order. Example for 3 chunks: [8, 3, 6]`,
      prompt: `Query: ${query}\n\n${chunksText}`,
    });

    // Parse the JSON array from response
    const match = text.match(/\[[\d\s,]+\]/);
    if (!match) throw new Error("No JSON array in response");
    const scores: number[] = JSON.parse(match[0]);

    return chunks.map((chunk, i) => ({
      ...chunk,
      relevanceScore: (scores[i] != null && scores[i] >= 1 && scores[i] <= 10) ? scores[i] : 5,
    }));
  } catch {
    // Fallback: map RRF scores to 1-10 range
    return rrfFallbackScores(chunks);
  }
}

/**
 * Map RRF scores to 1-10 range when reranking is unavailable.
 */
function rrfFallbackScores(
  chunks: FusedChunk[],
): Array<FusedChunk & { relevanceScore: number }> {
  if (chunks.length === 0) return [];
  const maxRrf = chunks[0].rrfScore;
  const minRrf = chunks[chunks.length - 1].rrfScore;
  const range = maxRrf - minRrf || 1;
  return chunks.map((chunk) => ({
    ...chunk,
    relevanceScore: Math.round(((chunk.rrfScore - minRrf) / range) * 7 + 3),
  }));
}

// ---------------------------------------------------------------------------
// Main hybrid search function
// ---------------------------------------------------------------------------

/**
 * Hybrid search: full-text + vector retrieval → RRF fusion → LLM reranking.
 *
 * @param query  The user's search query.
 * @param limit  Maximum number of file results to return (default 20).
 */
export async function hybridSearch(
  query: string,
  limit = 20,
): Promise<HybridSearchResult[]> {
  const t0 = Date.now();

  // Type alias for chunk hit shape used across retrieval legs
  type ChunkHit = { id: string; fileId: string; fileName: string; text: string; page?: number; chunkIndex: number };

  // 1. Start everything in parallel — only vector search needs the embedding
  const embeddingPromise = embed({
    model: gateway.embeddingModel("google/gemini-embedding-001"),
    value: query,
    providerOptions: {
      google: { outputDimensionality: 768 },
    },
  });

  const ftsPromise = searchChunksByFullText(query, 50).catch((err) => {
    console.log(`[search] FTS error: ${err}`);
    return [] as ChunkHit[];
  });

  const metadataPromise = searchFilesByMetadata(query).catch((err) => {
    console.log(`[search] Metadata search error: ${err}`);
    return [] as Array<{ fileId: string; fileName: string }>;
  });

  const ilikePromise = searchChunks(query, 30).catch((err) => {
    console.log(`[search] ILIKE error: ${err}`);
    return [] as Array<{ id: string; fileId: string; fileName: string; text: string; page?: number; chunkIndex: number }>;
  });

  // Vector search chains off the embedding — starts as soon as embedding completes
  const vectorPromise = embeddingPromise
    .then(({ embedding }) => searchChunksByEmbedding(embedding, 50))
    .catch((err) => {
      console.log(`[search] Vector search error: ${err}`);
      return [] as ChunkHit[];
    });

  // Wait for all legs
  const [ftsResult, vectorResult, metadataResult, ilikeResult] = await Promise.all([
    ftsPromise, vectorPromise, metadataPromise, ilikePromise,
  ]);

  const fullTextHits: ChunkHit[] = ftsResult;
  const vectorHits: ChunkHit[] = vectorResult;
  const metadataFiles = metadataResult;

  console.log(`[search] FTS returned ${fullTextHits.length} chunks for query "${query}"`);
  console.log(`[search] Vector search returned ${vectorHits.length} chunks`);
  console.log(`[search] Metadata search matched ${metadataFiles.length} files`);

  // Map ILIKE results to ChunkHit shape
  const ilikeHits: ChunkHit[] = ilikeResult.map((c) => ({
    id: c.id,
    fileId: c.fileId,
    fileName: c.fileName,
    text: c.text,
    page: c.page,
    chunkIndex: c.chunkIndex,
  }));
  if (ilikeHits.length > 0) {
    console.log(`[search] ILIKE returned ${ilikeHits.length} chunks`);
  }

  // 2. Metadata leg — batch fetch top 3 chunks for all matching files
  let metadataChunks: ChunkHit[] = [];
  if (metadataFiles.length > 0) {
    try {
      const metaFileIds = metadataFiles.map((mf) => mf.fileId);
      const chunkMap = await getTopChunksByFileIds(metaFileIds, 3);
      metadataChunks = metadataFiles.flatMap((mf) => {
        const chunks = chunkMap.get(mf.fileId) ?? [];
        return chunks.map((c) => ({
          id: c.id,
          fileId: c.fileId,
          fileName: mf.fileName,
          text: c.text,
          page: c.page,
          chunkIndex: c.chunkIndex,
        }));
      });
    } catch (err) {
      console.log(`[search] Metadata chunk fetch error: ${err}`);
    }
  }

  console.log(`[search] Retrieval phase: ${Date.now() - t0}ms`);

  // 3. Reciprocal Rank Fusion — merge all legs
  const rrfLists: ChunkHit[][] = [fullTextHits, vectorHits];
  // Only include ILIKE in RRF if FTS returned < 5 results
  if (ftsResult.length < 5 && ilikeHits.length > 0) rrfLists.push(ilikeHits);
  if (metadataChunks.length > 0) rrfLists.push(metadataChunks);

  const fused = reciprocalRankFusion(...rrfLists);
  console.log(`[search] RRF fusion produced ${fused.length} candidates`);
  console.log(`[search] Metadata + RRF: ${Date.now() - t0}ms`);

  // 4. Score top-N using RRF fallback (no LLM call — reranking is a separate endpoint)
  const topN = fused.slice(0, RERANK_LIMIT);
  const reranked = rrfFallbackScores(topN);

  const scores = reranked.map((c) => c.relevanceScore);
  console.log(`[search] RRF fallback scores: ${JSON.stringify(scores)}`);

  // 5. Filter & group by file
  const kept = reranked.filter((c) => c.relevanceScore >= MIN_RELEVANCE_SCORE);
  console.log(`[search] Kept ${kept.length} chunks after filtering (min score: ${MIN_RELEVANCE_SCORE})`);

  // Group by fileId
  const fileGroups = new Map<
    string,
    { fileName: string; chunks: Array<FusedChunk & { relevanceScore: number }> }
  >();

  for (const chunk of kept) {
    const existing = fileGroups.get(chunk.fileId);
    if (existing) {
      existing.chunks.push(chunk);
    } else {
      fileGroups.set(chunk.fileId, {
        fileName: chunk.fileName,
        chunks: [chunk],
      });
    }
  }

  // Sort files by their best chunk score (descending)
  const sortedGroups = [...fileGroups.entries()].sort((a, b) => {
    const bestA = Math.max(...a[1].chunks.map((c) => c.relevanceScore));
    const bestB = Math.max(...b[1].chunks.map((c) => c.relevanceScore));
    return bestB - bestA;
  });

  // 6. Batch-fetch full file records
  const fileIds = sortedGroups.slice(0, limit).map(([id]) => id);
  const fileMap = await getFilesByIds(fileIds);

  const results: HybridSearchResult[] = sortedGroups.slice(0, limit).map(([fileId, group]) => {
    const file = fileMap.get(fileId);
    return {
      file: {
        id: fileId,
        name: file?.name ?? group.fileName,
        path: file?.path ?? "",
        mimeType: file?.mimeType ?? "",
        metadata: file?.metadata,
      },
      chunks: group.chunks
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .map((c) => ({
          id: c.id,
          text: c.text,
          page: c.page,
          chunkIndex: c.chunkIndex,
          relevanceScore: c.relevanceScore,
        })),
      topScore: Math.max(...group.chunks.map((c) => c.relevanceScore)),
    };
  });

  console.log(`[search] Returning ${results.length} file results`);
  console.log(`[search] Total: ${Date.now() - t0}ms`);
  return results;
}


// ---------------------------------------------------------------------------
// Rerank results (separate from search for latency reasons)
// ---------------------------------------------------------------------------

/**
 * Rerank a set of hybrid search results using LLM (Gemini 3 Flash).
 *
 * Takes the fast RRF-scored results from `hybridSearch` and rescores them
 * via the `rerankChunks` helper. If the LLM call fails, returns the
 * original results unchanged (graceful degradation).
 */
export async function rerankResults(
  query: string,
  results: HybridSearchResult[],
): Promise<HybridSearchResult[]> {
  if (results.length === 0) return results;

  const t0 = Date.now();

  // Flatten all chunks from all results into FusedChunk shape for rerankChunks
  const allChunks: FusedChunk[] = results.flatMap((r) =>
    r.chunks.map((c) => ({
      id: c.id,
      fileId: r.file.id,
      fileName: r.file.name,
      text: c.text,
      page: c.page,
      chunkIndex: c.chunkIndex,
      rrfScore: c.relevanceScore, // Use existing score as base
    })),
  );

  // Rerank via LLM (falls back to RRF mapping internally on error)
  const reranked = await rerankChunks(query, allChunks);

  // Regroup by file
  const fileGroups = new Map<
    string,
    { file: HybridSearchResult["file"]; chunks: Array<typeof reranked[number]> }
  >();

  // Build a lookup for file metadata from original results
  const fileMeta = new Map(results.map((r) => [r.file.id, r.file]));

  for (const chunk of reranked) {
    const existing = fileGroups.get(chunk.fileId);
    if (existing) {
      existing.chunks.push(chunk);
    } else {
      fileGroups.set(chunk.fileId, {
        file: fileMeta.get(chunk.fileId) ?? {
          id: chunk.fileId,
          name: chunk.fileName,
          path: "",
          mimeType: "",
        },
        chunks: [chunk],
      });
    }
  }

  // Sort files by best chunk score, then sort chunks within each file
  const rerankedResults: HybridSearchResult[] = [...fileGroups.entries()]
    .sort((a, b) => {
      const bestA = Math.max(...a[1].chunks.map((c) => c.relevanceScore));
      const bestB = Math.max(...b[1].chunks.map((c) => c.relevanceScore));
      return bestB - bestA;
    })
    .map(([_, group]) => ({
      file: group.file,
      chunks: group.chunks
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .map((c) => ({
          id: c.id,
          text: c.text,
          page: c.page,
          chunkIndex: c.chunkIndex,
          relevanceScore: c.relevanceScore,
        })),
      topScore: Math.max(...group.chunks.map((c) => c.relevanceScore)),
    }));

  console.log(`[rerank] Reranked ${allChunks.length} chunks across ${rerankedResults.length} files in ${Date.now() - t0}ms`);
  return rerankedResults;
}
