import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
} from "react-router";
import type { Route } from "./+types/root";

// ---------------------------------------------------------------------------
// Root loader — inject env vars for client-side use
// ---------------------------------------------------------------------------

export function loader() {
  return {
    ENV: {
      API_URL: process.env.API_URL ?? "",
      API_KEY: process.env.API_KEY ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// Layout — wraps every page
// ---------------------------------------------------------------------------

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <style
          dangerouslySetInnerHTML={{
            __html: `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; background: #fafafa; line-height: 1.5; }
`,
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// ---------------------------------------------------------------------------
// App — renders the matched route + injects window.ENV
// ---------------------------------------------------------------------------

export default function App() {
  const { ENV } = useLoaderData<typeof loader>();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.ENV=${JSON.stringify(ENV)}`,
        }}
      />
      <Outlet />
    </>
  );
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    details = error.message;
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>{message}</h1>
      <p>{details}</p>
    </main>
  );
}

