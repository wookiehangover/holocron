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
  // Skip auth for the health check endpoint
  if (c.req.path === "/health") {
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

