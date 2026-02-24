import { createHash } from "node:crypto";

const AUTH_COOKIE_NAME = "holocron_auth";

/**
 * Compute the expected cookie token for a given password.
 * Token = SHA-256 hex digest of "holocron-auth:<password>".
 */
function computeToken(password: string): string {
  return createHash("sha256").update(`holocron-auth:${password}`).digest("hex");
}

/**
 * Check if a request carries a valid auth cookie.
 * When SITE_PASSWORD is unset, returns true (no auth required).
 */
export function isAuthenticated(request: Request): boolean {
  const password = process.env.SITE_PASSWORD;
  if (!password) return true;

  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return false;

  const expected = computeToken(password);
  return cookieHeader.includes(`${AUTH_COOKIE_NAME}=${expected}`);
}

/**
 * Validate a user-supplied password against SITE_PASSWORD.
 */
export function checkPassword(input: string): boolean {
  const password = process.env.SITE_PASSWORD;
  if (!password) return true;
  return input === password;
}

/**
 * Return whether a SITE_PASSWORD is configured.
 */
export function isPasswordRequired(): boolean {
  return !!process.env.SITE_PASSWORD;
}

/**
 * Generate the Set-Cookie header value to mark the user as authenticated.
 * Cookie is HttpOnly, SameSite=Strict, 7-day expiry, Secure in production.
 */
export function getAuthCookieHeader(): string {
  const password = process.env.SITE_PASSWORD;
  if (!password) return "";

  const token = computeToken(password);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`;
}
