import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useLoaderData } from "react-router";
import type { Route } from "./+types/root";
import { ThemeProvider, STORAGE_KEY } from "./lib/theme-provider";
import "./app.css";

// ---------------------------------------------------------------------------
// Inline script that runs before first paint to prevent FOUC.
// Reads the stored theme from localStorage and applies the correct class
// to <html> synchronously, before any CSS paints.
// ---------------------------------------------------------------------------
const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.add(d?"dark":"light")}catch(e){}})();`;

// ---------------------------------------------------------------------------
// Root loader — inject env vars for client-side use
// ---------------------------------------------------------------------------

export function loader() {
  return {
    ENV: {
      API_URL: process.env.API_URL ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// Layout — wraps every page
// ---------------------------------------------------------------------------

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Meta />
        <Links />
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
    <ThemeProvider>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.ENV=${JSON.stringify(ENV)}`,
        }}
      />
      <Outlet />
    </ThemeProvider>
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
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (error && error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="p-8 font-sans">
      <h1>{message}</h1>
      <p>{details}</p>
    </main>
  );
}
