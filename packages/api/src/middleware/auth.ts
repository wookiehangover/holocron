import { createMiddleware } from "hono/factory";

/**
 * API key authentication middleware.
 *
 * Validates the `X-Api-Key` header against `process.env.AGENTDB_API_KEY`.
 * Requests without a valid key receive a 401 JSON response.
 *
 * The `/health` endpoint is excluded from authentication.
 */
export const apiKeyAuth = createMiddleware(async (c, next) => {
  // Skip auth for CORS preflight, health check, and public share-link resolution
  if (
    c.req.method === "OPTIONS" ||
    c.req.path === "/health" ||
    c.req.path.startsWith("/share/")
  ) {
    await next();
    return;
  }

  const apiKey = c.req.header("X-Api-Key");
  const expected = process.env.AGENTDB_API_KEY;

  if (!expected || apiKey !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

