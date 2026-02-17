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
  getFileById,
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
const MIN_RELEVANCE_SCORE = 3;

const RERANK_SYSTEM_PROMPT = `Score how well this text chunk answers the given query on a scale of 1-10.
10: Perfectly answers the query
7-9: Contains most needed information
5-6: Contains some relevant information
3-4: Minimal relevance
1-2: No relevance
Return only a single integer (1-10).`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reciprocal Rank Fusion: merge two ranked lists by chunk ID.
 * Score = Σ 1/(k + rank) where rank is 1-based position.
 */
function reciprocalRankFusion(
  fullTextResults: Array<{ id: string; fileId: string; fileName: string; text: string; page?: number; chunkIndex: number }>,
  vectorResults: Array<{ id: string; fileId: string; fileName: string; text: string; page?: number; chunkIndex: number }>,
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

  addScores(fullTextResults);
  addScores(vectorResults);

  return [...scoreMap.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}

/**
 * Rerank chunks using Gemini 3 Flash. Returns relevance scores (1-10).
 * Falls back to mapping RRF scores to 1-10 range if the LLM call fails.
 */
async function rerankChunks(
  query: string,
  chunks: FusedChunk[],
): Promise<Array<FusedChunk & { relevanceScore: number }>> {
  try {
    const scores = await Promise.all(
      chunks.map(async (chunk) => {
        const { text } = await generateText({
          model: gateway("google/gemini-3-flash"),
          system: RERANK_SYSTEM_PROMPT,
          prompt: `Query: ${query}\n\nText chunk:\n${chunk.text}`,
        });
        const parsed = parseInt(text.trim(), 10);
        return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10
          ? parsed
          : 5;
      }),
    );
    return chunks.map((chunk, i) => ({ ...chunk, relevanceScore: scores[i] }));
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
    relevanceScore: Math.round(((chunk.rrfScore - minRrf) / range) * 9 + 1),
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
  // 1. Embed the query
  const { embedding } = await embed({
    model: gateway.embeddingModel("google/gemini-embedding-001"),
    value: query,
    providerOptions: {
      google: { outputDimensionality: 768 },
    },
  });

  // 2. Parallel retrieval
  const [fullTextHits, vectorHits] = await Promise.all([
    searchChunksByFullText(query, 50),
    searchChunksByEmbedding(embedding, 50),
  ]);

  // 3. Reciprocal Rank Fusion
  const fused = reciprocalRankFusion(fullTextHits, vectorHits);

  // 4. Rerank top-N
  const topN = fused.slice(0, RERANK_LIMIT);
  const reranked = await rerankChunks(query, topN);

  // 5. Filter & group by file
  const kept = reranked.filter((c) => c.relevanceScore >= MIN_RELEVANCE_SCORE);

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

  // Build results with full file records
  const results: HybridSearchResult[] = [];

  for (const [fileId, group] of sortedGroups.slice(0, limit)) {
    const file = await getFileById(fileId);
    results.push({
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
    });
  }

  return results;
}
